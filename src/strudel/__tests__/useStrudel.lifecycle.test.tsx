// useStrudel against a flooding page, late page errors, and calls that come after the card has
// hidden or unmounted.
import { act, render } from '@testing-library/react-native';
import { Activity, createElement } from 'react';

import { logWarning } from '../../log';
import {
  advance,
  call,
  CODE,
  mountPlayer,
  play,
  playingPlayer,
  readyPlayer,
} from '../testing/player';
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

  it('updates once for 1,000 different steps within one millisecond, then again 16 ms on', () => {
    const { result, renders } = playingPlayer();
    const before = renders();
    for (let index = 0; index < 1000; index += 1) {
      pagePosts({ type: 'step', step: index % 16 });
    }
    expect(renders() - before).toBe(1);
    expect(result.current.step).toBe(0);

    advance(STEP_GAP_MS - 1);
    pagePosts({ type: 'step', step: 9 });
    expect(result.current.step).toBe(0);
    advance(1);
    pagePosts({ type: 'step', step: 9 });
    expect(result.current.step).toBe(9);
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
  it.each(['play', 'stop', 'reset', 'clearError'] as const)(
    '%s does nothing: no message, no timer, no log',
    (action) => {
      const { result, unmountHook } = playingPlayer();
      pagePosts({ type: 'error', message: 'kept' });
      play(result);
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
  it('logs the first dropped message of a fresh session once, without its content', () => {
    // A fresh copy of every module, so the session-wide flag starts unset whatever ran before.
    // RNTL's `pure` entry adds no test hooks, which cannot be added inside a test.
    mountPlayer();
    postRaw('uses up the log of the modules this file shares');
    jest.mocked(logWarning).mockClear();
    jest.isolateModules(() => {
      const rntl = jest.requireActual<typeof import('@testing-library/react-native/pure')>(
        '@testing-library/react-native/pure',
      );
      const fresh = jest.requireActual<typeof import('../useStrudel')>('../useStrudel');
      const log = jest.requireMock<typeof import('../../log')>('../../log');
      function FreshScreen() {
        return fresh.useStrudel().player;
      }
      rntl.render(createElement(FreshScreen));
      const host = rntl.screen.getByTestId('webview-mock', { includeHiddenElements: true });
      for (const data of ['{"type":"error","message":"the learner code"', 'again', 42]) {
        rntl.fireEvent(host, 'message', { nativeEvent: { data } });
      }
      expect(jest.mocked(log.logWarning).mock.calls).toStrictEqual([['strudel_message_dropped']]);
      rntl.cleanup();
    });
  });

  it('never logs a dropped message with its content', () => {
    mountPlayer();
    postRaw('secret code');
    for (const logged of jest.mocked(logWarning).mock.calls) {
      expect(logged).toStrictEqual(['strudel_message_dropped']);
    }
  });
});
