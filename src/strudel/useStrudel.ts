// Plays Strudel code through the hidden WebView page. The exercise and checkpoint cards use this
// hook; it is the app's only way to reach the page (rule SS-9).
//
// The page runs code the learner types, so nothing it sends is trusted: every message goes
// through `decode` (./bridge.ts), and the hook acts only on what fits its state. Readiness comes
// only from a validated `ready` message, never from the WebView's load events, which the page can
// forge. Unavailability comes only from the readiness timeout and the WebView's error and
// process-gone callbacks.
import { createElement, useLayoutEffect, useMemo, useState, type ReactElement } from 'react';
import type { WebView } from 'react-native-webview';

import { logWarning } from '../log';
import { createMessageGate, decode, MAX_CODE_LENGTH, type FromPage, type ToPage } from './bridge';
import { registerPlayer, stopOtherPlayers } from './playerRegistry';
import { StepClock } from './stepClock';
import { sendToPage, StrudelPlayer, type UnavailableReason } from './StrudelPlayer';

/**
 * The errors the app itself reports in `error`, as fixed keys a card maps to its own text. Any
 * other `error` is the page's text (cut to 500 characters): untrusted, to be shown as plain text
 * only, never as markup or code.
 */
export const STRUDEL_ERROR = {
  /** `play` got code longer than 5,000 characters; nothing was sent. */
  codeTooLong: 'code_too_long',
  /** `play` was called while the player is unavailable; nothing was sent. */
  playerUnavailable: 'player_unavailable',
  /** The page answered a play with no `step`, `needsNetwork` or `error` within 10 seconds. */
  pageSilent: 'page_silent',
} as const;

/** How long the page has to post `ready` after the hook mounts or resets. */
const READY_TIMEOUT_MS = 5000;

/**
 * How long the page has to answer a play with a `step`, `needsNetwork` or `error` message: the
 * page waits up to 3 seconds for the audio to resume and 5 for the samples (page/audio.js), then
 * posts a step within a tick of starting; the rest is margin. Learner code can leave the page
 * silent (`while (true) {}`, `document.open()`), and the card would show Stop forever.
 */
const PLAY_LIMIT_MS = 10_000;

/**
 * The shortest time between two page `step` messages that both update the state. A step that
 * comes sooner is dropped (the next one carries the newer step), so a page that floods the bridge
 * cannot re-render the card on every message. Steps are 125 ms apart at Strudel's default tempo.
 */
const STEP_GAP_MS = 16;

interface PlayerState {
  status: 'starting' | 'ready' | 'unavailable';
  playing: boolean;
  step: number | null;
  error: string | null;
  needsNetwork: boolean;
}

/** What `useStrudel` returns. */
export interface Strudel extends PlayerState {
  /** Loads and plays `code`, stopping every other player first. */
  play: (code: string) => void;
  stop: () => void;
  clearError: () => void;
  /** Loads a fresh page: evaluated code can leave timers and audio nodes that `stop` does not. */
  reset: () => void;
  /** The hidden WebView. Render it exactly once. */
  player: ReactElement;
}

const INITIAL: PlayerState = {
  status: 'starting',
  playing: false,
  step: null,
  error: null,
  needsNetwork: false,
};

/** Whether this app session has logged a dropped message: it logs only the first. */
let droppedMessageLogged = false;

/** Once per app session, and never with the message: it can hold the learner's code. */
function logDroppedMessage(): void {
  if (!droppedMessageLogged) {
    droppedMessageLogged = true;
    logWarning('strudel_message_dropped');
  }
}

type Publish = (state: PlayerState, page: number) => void;

/**
 * The card a player belongs to, named in its `strudel_unavailable` log so a page that did not
 * answer can be traced to its card: the card's page in the set, and its id when the API served it.
 */
export type PlayerOwner = { cardIndex: number; cardId?: string };

/** One player's state, WebView and timers. Its public members are stable functions. */
class Session {
  private state = INITIAL;
  /** Which load of the page this is; `reset` moves it on, which replaces the WebView. */
  private page = 0;
  private webView: WebView | null = null;
  /** Drops what this load of the page sends beyond the bridge's rate and size limits. */
  private gate = createMessageGate();
  /** Between mount and unmount. The actions do nothing outside it. */
  private mounted = false;
  /**
   * When the last page `step` updated the state, by `performance.now()`: monotonic, so a system
   * clock set back cannot hold every step for the time it moved.
   */
  private lastStepAt = -Infinity;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  /** Runs from a play until the page's first answer to it; see `PLAY_LIMIT_MS`. */
  private playTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly clock = new StepClock((step) => {
    this.update({ step });
  });
  private readonly publish: Publish;
  private readonly owner: PlayerOwner | undefined;

  constructor(publish: Publish, owner: PlayerOwner | undefined) {
    this.publish = publish;
    this.owner = owner;
  }

  private update(change: Partial<PlayerState>): void {
    this.state = { ...this.state, ...change };
    this.publish(this.state, this.page);
  }

  private send(message: ToPage): void {
    sendToPage(this.webView, message);
  }

  private waitForReady(): void {
    this.readyTimer = setTimeout(() => {
      this.fail('timeout');
    }, READY_TIMEOUT_MS);
  }

  private clearTimers(): void {
    clearTimeout(this.readyTimer);
    clearTimeout(this.playTimer);
    this.clock.stop();
  }

  /** Starts waiting for the page to answer a play, in place of any earlier wait. */
  private awaitAnswer(): void {
    clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => {
      this.pageSilent();
    }, PLAY_LIMIT_MS);
  }

  /** The page did not answer a play: stop, as far as the page still listens, and fail. */
  private pageSilent(): void {
    this.send({ type: 'stop' });
    this.clock.stop();
    this.update({ playing: false, step: null, error: STRUDEL_ERROR.pageSilent });
    logWarning('strudel_page_silent');
  }

  /** Stops playing, if it is, and every timer: the state a hidden or replaced player is in. */
  private halt(): void {
    if (this.state.playing) {
      this.send({ type: 'stop' });
    }
    this.clearTimers();
    this.update({ playing: false, step: null, needsNetwork: false });
  }

  /** Takes a page step unless it is the current one or comes within 16 ms of the last taken. */
  private followStep(step: number): void {
    const now = performance.now();
    if (step === this.state.step || now - this.lastStepAt < STEP_GAP_MS) {
      return;
    }
    this.lastStepAt = now;
    this.update({ step });
  }

  /**
   * A page message while ready. An error counts only while playing (from `play` on, before the
   * first step included): one that arrives after `stop` is from a run the learner ended.
   */
  private handle(message: FromPage): void {
    if (message.type !== 'ready') {
      clearTimeout(this.playTimer);
    }
    const listening = this.state.playing && !this.clock.running;
    if (message.type === 'error' && this.state.playing) {
      this.clock.stop();
      this.update({ error: message.message, playing: false, step: null });
    } else if (message.type === 'step' && listening) {
      this.followStep(message.step);
    } else if (message.type === 'needsNetwork' && listening) {
      this.update({ needsNetwork: true });
      this.clock.start();
    }
  }

  /** The WebView's ref. */
  readonly attach = (webView: WebView | null): void => {
    this.webView = webView;
  };

  /**
   * Mounts the session; the returned function unmounts it and leaves it stopped, so a card that
   * is hidden and shown again (not unmounted) does not come back claiming to play.
   */
  readonly mount = (): (() => void) => {
    this.mounted = true;
    const unregister = registerPlayer(this.stopIfPlaying);
    if (this.state.status === 'starting') {
      this.waitForReady();
    }
    return () => {
      unregister();
      this.halt();
      this.mounted = false;
    };
  };

  /**
   * A message from load `page` of the page; one from a page `reset` replaced is ignored, and so
   * is one the gate drops (a flood, or an oversized message), before it is decoded.
   */
  readonly receive = (raw: unknown, page: number): void => {
    if (page !== this.page || !this.gate(raw)) {
      return;
    }
    const message = decode(raw);
    if (message === null) {
      logDroppedMessage();
    } else if (this.state.status === 'starting' && message.type === 'ready') {
      clearTimeout(this.readyTimer);
      this.update({ status: 'ready' });
    } else if (this.state.status === 'ready') {
      this.handle(message);
    }
  };

  readonly fail = (reason: UnavailableReason, page = this.page): void => {
    if (this.state.status === 'unavailable' || page !== this.page) {
      return;
    }
    this.clearTimers();
    this.update({ status: 'unavailable', playing: false, step: null });
    logWarning('strudel_unavailable', { reason, ...this.owner });
  };

  readonly play = (code: string): void => {
    if (!this.mounted) {
      return;
    }
    if (this.state.status === 'unavailable') {
      this.update({ error: STRUDEL_ERROR.playerUnavailable });
    } else if (this.state.status === 'ready' && code.length > MAX_CODE_LENGTH) {
      this.update({ error: STRUDEL_ERROR.codeTooLong });
    } else if (this.state.status === 'ready') {
      stopOtherPlayers(this.stopIfPlaying);
      this.clock.stop();
      this.send({ type: 'load', code });
      this.send({ type: 'play' });
      this.lastStepAt = -Infinity;
      this.update({ playing: true, step: null, error: null, needsNetwork: false });
      this.awaitAnswer();
    }
  };

  readonly stop = (): void => {
    if (!this.mounted) {
      return;
    }
    this.clock.stop();
    clearTimeout(this.playTimer);
    if (this.state.status === 'ready') {
      this.send({ type: 'stop' });
    }
    this.update({ playing: false, step: null });
  };

  readonly stopIfPlaying = (): void => {
    if (this.state.playing) {
      this.stop();
    }
  };

  readonly clearError = (): void => {
    if (this.mounted) {
      this.update({ error: null });
    }
  };

  readonly reset = (): void => {
    if (!this.mounted) {
      return;
    }
    this.halt();
    this.page += 1;
    this.gate = createMessageGate();
    this.update(INITIAL);
    this.waitForReady();
  };
}

/**
 * The Strudel player for one card, `owner` (named in the log when the player becomes
 * unavailable). Render the returned `player` once; until it is rendered the page never loads, and
 * the hook turns `unavailable` after 5 seconds.
 *
 * - `status`: `starting` until the page posts `ready`; `unavailable` if it does not within 5
 *   seconds, or if the page's process ends or it fails to load. `reset` starts again.
 * - `play(code)`: when ready, sends the code and starts it, stopping every other player first.
 *   Starting, it does nothing; unavailable, or with code over 5,000 characters, it sends nothing
 *   and sets `error` to a `STRUDEL_ERROR` key.
 * - `step`: the 16th step being heard, 0 to 15, while playing; null otherwise.
 * - `needsNetwork`: the samples could not load. Playing goes on, and the hook counts the steps
 *   itself every `motion.beatStep` ms until the next play.
 * - `error`: a `STRUDEL_ERROR` key, or the page's error text (untrusted; plain text only).
 * - A play the page does not answer (no `step`, `needsNetwork` or `error`) within 10 seconds
 *   stops, and `error` becomes `STRUDEL_ERROR.pageSilent`; `reset()` loads a fresh page.
 * - `reset()`: replaces the page with a fresh one and starts waiting for `ready` again.
 * - After the hook unmounts, `play`, `stop`, `reset` and `clearError` do nothing. Unmounting (or
 *   hiding the card, which runs the same cleanup) sends `stop` if playing and leaves it stopped.
 */
export function useStrudel(owner?: PlayerOwner): Strudel {
  const [{ state, page }, setView] = useState({ state: INITIAL, page: 0 });
  const [session] = useState(
    () =>
      new Session((next, nextPage) => {
        setView({ state: next, page: nextPage });
      }, owner),
  );
  // A layout effect: on unmount it runs before React detaches the WebView's ref, so the stop
  // message still reaches the page.
  useLayoutEffect(() => session.mount(), [session]);
  const player = useMemo(
    () =>
      createElement(StrudelPlayer, {
        page,
        webViewRef: session.attach,
        onMessage: session.receive,
        onUnavailable: session.fail,
      }),
    [session, page],
  );

  return {
    ...state,
    play: session.play,
    stop: session.stop,
    clearError: session.clearError,
    reset: session.reset,
    player,
  };
}
