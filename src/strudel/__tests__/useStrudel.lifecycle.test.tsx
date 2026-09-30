// useStrudel against a flooding page, late page errors, and calls that come after the card has
// hidden or unmounted.
import { act, render } from '@testing-library/react-native';
import { Activity } from 'react';

import { logWarning } from '../../log';
import {
  advance,
  call,
  CODE,
  mountPlayer,
  mountTwoPlayers,
  play,
  playingPlayer,
  readyPlayer,
} from '../testing/player';
import { logsOfFreshSession } from '../testing/freshSession';
import { pagePosts, postRaw, sentToPage, webView } from '../testing/webview';
import { useStrudel, type Strudel } from '../useStrudel';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

/** The shortest gap between two page steps that both update the state, in ms. */
const STEP_GAP_MS = 16;

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(logWarning).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Checks that a new page step is held back until `ms` after now: one posted a millisecond short
 * leaves the step at `held`, and one posted at `ms` is taken.
 */
function expectNextStepAfter(ms: number, result: { current: Strudel }, held: number): void {
  // The gates read performance.now(), which Jest's fake timers move with the time they fake.
  const clock = performance.now();
  advance(ms - 1);
  expect(performance.now() - clock).toBe(ms - 1);
  pagePosts({ type: 'step', step: 9 });
  expect(result.current.step).toBe(held);
  advance(1);
  pagePosts({ type: 'step', step: 9 });
  expect(result.current.step).toBe(9);
}

describe('useStrudel: a flood of step messages', () => {
  it('updates once for the same step twice', () => {
    const { result, renders } = playingPlayer();
    const before = renders();
    pagePosts({ type: 'step', step: 3 });
    advance(STEP_GAP_MS);
    pagePosts({ type: 'step', step: 3 });
    expect(renders() - before).toBe(1);
    expect(result.current.step).toBe(3);
  });

  it('updates once for two different steps within one millisecond, then again 16 ms on', () => {
    const { result, renders } = playingPlayer();
    const before = renders();
    pagePosts({ type: 'step', step: 0 });
    pagePosts({ type: 'step', step: 1 });
    expect(renders() - before).toBe(1);
    expect(result.current.step).toBe(0);
    expectNextStepAfter(STEP_GAP_MS, result, 0);
  });

  it('updates once for 1,000 different steps within one millisecond, then again a second on', () => {
    const { result, renders } = playingPlayer();
    const before = renders();
    for (let index = 0; index < 1000; index += 1) {
      pagePosts({ type: 'step', step: index % 16 });
    }
    expect(renders() - before).toBe(1);
    expect(result.current.step).toBe(0);
    // The bridge's gate lets 60 messages through in a second (bridge.flood.test.ts).
    expectNextStepAfter(1000, result, 0);
  });

  it('takes the first step after a new play at once', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'step', step: 4 });
    play(result);
    pagePosts({ type: 'step', step: 5 });
    expect(result.current.step).toBe(5);
  });
});

describe('useStrudel: late page errors', () => {
  it('ignores an error while not playing: never played, and after stop', () => {
    const { result } = readyPlayer();
    pagePosts({ type: 'error', message: 'late' });
    expect(result.current.error).toBeNull();
    play(result);
    call(result, 'stop');
    pagePosts({ type: 'error', message: 'late' });
    expect(result.current).toMatchObject({ playing: false, error: null });
  });

  it('takes an error that arrives after play and before the first step', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'error', message: 'syntax' });
    expect(result.current).toMatchObject({ playing: false, step: null, error: 'syntax' });
  });
});

describe('useStrudel: after unmount', () => {
  it('play does not stop another player that is playing', () => {
    const { first, second } = mountTwoPlayers();
    play(second.result);
    const stale = first.result.current;
    first.unmount();
    const sentToSecond = sentToPage(1).length;
    act(() => {
      stale.play(CODE);
    });
    expect(second.result.current.playing).toBe(true);
    expect(sentToPage(1)).toHaveLength(sentToSecond);
  });

  // Here each player is rendered in its own root, so its WebView outlives the hook: an action
  // that ran after unmount would reach that page or start a timer. In an app the player unmounts
  // with the hook, so `stop` then has nothing left to reach.
  it.each(['play', 'stop', 'reset'] as const)(
    '%s sends nothing to the page that outlived the hook, starts no timer and logs nothing',
    (action) => {
      const { result, unmountHook } = playingPlayer();
      const page = webView();
      unmountHook();
      const sent = page.injected.length;
      const timers = jest.getTimerCount();
      const stale = result.current;
      act(() => {
        if (action === 'play') {
          stale.play(CODE);
        } else {
          stale[action]();
        }
      });
      expect(page.injected).toHaveLength(sent);
      expect(jest.getTimerCount()).toBe(timers);
      advance(10_000);
      expect(jest.mocked(logWarning).mock.calls).toStrictEqual([]);
    },
  );

  // clearError after unmount changes only state that no one reads any more: nothing to observe.
  it('clearError does not throw', () => {
    const { result, unmountHook } = playingPlayer();
    unmountHook();
    const stale = result.current;
    expect(() => {
      act(() => {
        stale.clearError();
      });
    }).not.toThrow();
  });
});

describe('useStrudel: hidden and shown again', () => {
  function Screen({ onRender }: { onRender: (strudel: Strudel) => void }) {
    const strudel = useStrudel();
    onRender(strudel);
    return strudel.player;
  }

  it('comes back stopped, with stop sent, when its card hid while playing', () => {
    let latest: Strudel | undefined;
    const onRender = (strudel: Strudel) => {
      latest = strudel;
    };
    const screen = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <Screen onRender={onRender} />
      </Activity>
    );
    const view = render(screen('visible'));
    pagePosts({ type: 'ready' });
    act(() => {
      latest?.play(CODE);
    });
    pagePosts({ type: 'needsNetwork' });
    const page = webView();
    expect(latest).toMatchObject({ playing: true, needsNetwork: true, step: 0 });

    view.rerender(screen('hidden'));
    view.rerender(screen('visible'));

    expect(sentToPage(page).at(-1)).toStrictEqual({ type: 'stop' });
    expect(latest).toMatchObject({
      status: 'ready',
      playing: false,
      step: null,
      needsNetwork: false,
    });
    advance(1000);
    expect(latest?.step).toBeNull();
  });
});

describe('useStrudel: the dropped-message log', () => {
  /** A string no real log line contains, to search the logged values for. */
  const MARKER = 'LEARNER-CODE-MARKER-3141';

  it('logs the first dropped message of a fresh session once', () => {
    // Uses up the log in the modules this file shares; the fresh session must still log.
    mountPlayer();
    postRaw('bad');
    const calls = logsOfFreshSession(['{"type":"error","message":"x"', 'again', 42]);
    expect(calls).toStrictEqual([['strudel_message_dropped']]);
  });

  it('never logs the content of a dropped message', () => {
    const calls = logsOfFreshSession([
      `{"type":"error","message":"${MARKER}"`,
      `s("${MARKER}")`,
      { type: 'error', message: MARKER, nested: [{ code: MARKER }] },
    ]);
    expect(calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(calls)).not.toContain(MARKER);
  });
});
