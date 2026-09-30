// The page inside the hidden WebView that plays the learner's Strudel code. scripts/build-strudel.mjs
// bundles this file with @strudel/web into the page (index.html); the tests in
// scripts/__tests__/player.test.mjs import it directly, with fakes for everything it talks to.
// It runs in WKWebView on the app's minimum iOS, 16.4; the build lowers its syntax to Safari 16.4.
//
// Message contract (Task 25 types it in src/strudel/bridge.ts). Each message is a JSON string.
//   App to page: {type:'load', code}, {type:'play'}, {type:'stop'}
//   Page to app: {type:'ready'}, {type:'error', message}, {type:'step', step}, {type:'needsNetwork'}

import { createAudioPreparer } from './audio.js';
import { createTicker } from './steps.js';
import { blockWebRtc } from './webrtc.js';

/**
 * @typedef {{ type: 'load', code: string } | { type: 'play' } | { type: 'stop' }} ToPage
 * @typedef {{ type: 'ready' } | { type: 'error', message: string } | { type: 'step', step: number }
 *   | { type: 'needsNetwork' }} FromPage
 * @typedef {(message: FromPage) => void} Post
 * @typedef {import('./steps.js').Scheduler} Scheduler
 * @typedef {import('./steps.js').Timers & import('./audio.js').Timeouts} Timers
 * @typedef {{ evaluate(code: string, autoplay: boolean): Promise<unknown>,
 *   start(): Promise<void> | void, stop(): void, scheduler: Scheduler }} Repl
 * @typedef {import('./audio.js').Audio} Audio
 * @typedef {{ handle(raw: unknown): Promise<void>, reportError(error: unknown): void,
 *   onLog(detail: { message?: unknown } | undefined): void, onNetworkFailure(): void }} Player
 */

/** The longest code the page evaluates: the app's own limit for checkpoint code. */
export const MAX_CODE_LENGTH = 5000;
const MAX_ERROR_LENGTH = 500;
/** An error message never repeats the learner's code once it is at least this long. */
const MIN_REDACTED_CODE_LENGTH = 8;
/** How @strudel/web 1.3.0 logs an error thrown while the scheduler queries the pattern. */
const SCHEDULER_ERROR_PREFIX = '[cyclist] error: ';

/**
 * Reads one message from the app. Anything that is not a known message gives null.
 * @param {unknown} raw
 * @returns {ToPage | null}
 */
export function parseMessage(raw) {
  if (typeof raw !== 'string') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  if (value.type === 'play' || value.type === 'stop') return { type: value.type };
  if (value.type === 'load' && typeof value.code === 'string') {
    return { type: 'load', code: value.code };
  }
  return null;
}

/**
 * Posts to the app through react-native-webview's bridge. Opened in a desktop browser for
 * debugging, the page has no bridge and posting does nothing.
 * @param {{ ReactNativeWebView?: { postMessage(raw: string): void } }} win
 * @returns {Post}
 */
export function createPoster(win) {
  return (message) => {
    const bridge = win.ReactNativeWebView;
    if (bridge) bridge.postMessage(JSON.stringify(message));
  };
}

/**
 * The text of an error, cut to 500 characters, with the learner's code taken out.
 * @param {unknown} error
 * @param {string} code
 */
export function errorText(error, code) {
  const text = error instanceof Error ? error.message : String(error);
  const redacted = code.length >= MIN_REDACTED_CODE_LENGTH ? text.split(code).join('<code>') : text;
  return redacted.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Wraps fetch to call onFailure when a request fails or is refused. Every request this page
 * makes loads samples, so a failure means the samples are unavailable.
 * @param {typeof fetch} fetchImpl
 * @param {() => void} onFailure
 * @returns {typeof fetch}
 */
export function watchFetch(fetchImpl, onFailure) {
  return async (input, init) => {
    try {
      const response = await fetchImpl(input, init);
      if (!response.ok) onFailure();
      return response;
    } catch (error) {
      onFailure();
      throw error;
    }
  };
}

/**
 * The page's message handling.
 * @param {{ repl: Repl, audio: Audio, post: Post, timers: Timers }} options
 * @returns {Player}
 */
export function createPlayer({ repl, audio, post, timers }) {
  const ticker = createTicker({ scheduler: repl.scheduler, post, timers });
  const state = {
    code: '',
    loaded: Promise.resolve(false),
    run: 0,
    playing: false,
    net: false,
  };

  /** @param {unknown} error */
  const reportError = (error) => {
    post({ type: 'error', message: errorText(error, state.code) });
  };
  const onNetworkFailure = () => {
    if (state.net) return;
    state.net = true;
    post({ type: 'needsNetwork' });
  };
  const audioStart = createAudioPreparer({ audio, onNetworkFailure, timers });
  const stop = () => {
    state.run += 1;
    state.playing = false;
    audioStart.cancel();
    ticker.stop();
    repl.stop();
  };
  // After a failed load nothing may keep playing: the app treats an error as stopped.
  const cancel = () => {
    if (state.playing) stop();
    else state.run += 1;
  };

  /** @param {string} code */
  const evaluate = async (code) => {
    try {
      return (await repl.evaluate(code, false)) !== undefined;
    } catch (error) {
      reportError(error);
      return false;
    }
  };
  /** @param {string} code */
  const load = (code) => {
    state.code = code;
    if (code.length > MAX_CODE_LENGTH) {
      post({ type: 'error', message: `Code is longer than ${MAX_CODE_LENGTH} characters.` });
      state.loaded = Promise.resolve(false);
    } else {
      state.loaded = evaluate(code);
    }
    return state.loaded.then((ok) => {
      if (!ok) cancel();
    });
  };

  const play = async () => {
    const run = (state.run += 1);
    if (!(await state.loaded) || run !== state.run) return;
    state.net = false;
    try {
      if (!(await audioStart.prepare()) || run !== state.run) return;
      repl.stop();
      await repl.start();
      ticker.start();
      state.playing = true;
    } catch (error) {
      // A play that a stop, a newer play or a failed load has replaced reports nothing.
      if (run === state.run) reportError(error);
    }
  };

  /** @param {unknown} raw */
  const handle = async (raw) => {
    const message = parseMessage(raw);
    if (message === null) return;
    if (message.type === 'load') return load(message.code);
    if (message.type === 'play') return play();
    stop();
  };
  /** @param {{ message?: unknown } | undefined} detail */
  const onLog = (detail) => {
    const message = detail?.message;
    if (typeof message !== 'string' || !message.startsWith(SCHEDULER_ERROR_PREFIX)) return;
    stop();
    reportError(message.slice(SCHEDULER_ERROR_PREFIX.length));
  };
  return { handle, reportError, onLog, onNetworkFailure };
}

// Learner code runs in this page, and react-native-webview 13.16.1 shows `alert`, `confirm` and
// `prompt` as native alerts over the app (RNCWebViewImpl.m), with page-controlled text; no prop
// turns that off. The WebView replaces them in every frame before any content runs
// (src/strudel/dialogScript.ts); the page replaces them again here, and `print`, before any
// learner code can run, with functions that show nothing and return what a dismissed dialog
// returns. They are read-only and non-configurable, so a snippet cannot assign them back. A frame
// a snippet creates has a fresh `window`: removeFrames silences each frame's window and blocks its
// WebRTC before it takes the frame out, but a mutation observer runs after the snippet's
// synchronous code; the WebView's own injection into every frame is meant to cover that gap for
// the dialogs (not yet checked on a device for a frame a script creates), not for WebRTC.
// `document.open()` from learner code also removes the page's `message` listener: the player then
// stops answering, and the app's readiness and playing state go stale until the card calls
// `reset()` (the app's play watchdog reports it).
const DIALOGS = {
  alert: () => undefined,
  confirm: () => false,
  prompt: () => null,
  print: () => undefined,
};
const FRAME_SELECTOR = 'iframe, frame, object, embed';
const ELEMENT_NODE = 1;

/**
 * Replaces the window's dialogs with silent, non-writable, non-configurable stubs.
 * @param {object} win
 */
export function silenceDialogs(win) {
  for (const [name, value] of Object.entries(DIALOGS)) {
    try {
      Object.defineProperty(win, name, { value, writable: false, configurable: false });
    } catch {
      // The engine will not let this one be replaced. The page must still start and post ready,
      // so it goes on; the device checklist covers each dialog.
    }
  }
}

/**
 * Silences a frame's own window and blocks its WebRTC, then takes the frame out. A window that
 * cannot be read (another origin) is left alone; the frame is removed all the same.
 * @param {Element & { contentWindow?: object | null }} frame
 */
function removeFrame(frame) {
  try {
    const win = frame.contentWindow;
    if (win) {
      silenceDialogs(win);
      blockWebRtc(win);
    }
  } catch {
    // Not readable from here: nothing in it can be changed, and it is removed below.
  }
  frame.remove();
}

/**
 * Removes every frame added to the document from now on; the page has no use for frames. Each
 * frame's window is silenced first (removeFrame). It observes the document itself, not its root
 * element, which `document.open()` replaces.
 * @param {Node} doc
 * @param {typeof MutationObserver} Observer
 */
export function removeFrames(doc, Observer) {
  /** @param {Node} node */
  const sweep = (node) => {
    if (node.nodeType !== ELEMENT_NODE) return;
    const element = /** @type {Element} */ (node);
    if (element.matches(FRAME_SELECTOR)) removeFrame(element);
    else for (const frame of element.querySelectorAll(FRAME_SELECTOR)) removeFrame(frame);
  };
  const observer = new Observer((records) => {
    for (const record of records) record.addedNodes.forEach(sweep);
  });
  observer.observe(doc, { childList: true, subtree: true });
}

/**
 * Wires the page to the real window and Strudel: silences dialogs, blocks WebRTC and frames first
 * (before Strudel, so before any card code), then starts
 * Strudel, posts ready once it has initialized, then handles the app's messages. If Strudel fails
 * to start, the page stays silent and the app gives up waiting for ready.
 * @param {Window & Timers & { ReactNativeWebView?: { postMessage(raw: string): void } }} win
 * @param {Audio & { initStrudel(options: { onEvalError(error: unknown): void }): Promise<Repl> }} strudel
 */
export async function startPage(win, strudel) {
  silenceDialogs(win);
  blockWebRtc(win);
  removeFrames(win.document, win.MutationObserver);
  const post = createPoster(win);
  /** @type {Player | undefined} */
  let player;
  win.fetch = watchFetch(win.fetch.bind(win), () => player?.onNetworkFailure());
  let repl;
  try {
    repl = await strudel.initStrudel({ onEvalError: (error) => player?.reportError(error) });
  } catch {
    return;
  }
  const ready = createPlayer({ repl, audio: strudel, post, timers: win });
  player = ready;
  win.addEventListener('message', (event) => ready.handle(event.data));
  win.document.addEventListener('strudel.log', (event) => ready.onLog(event.detail));
  post({ type: 'ready' });
}
