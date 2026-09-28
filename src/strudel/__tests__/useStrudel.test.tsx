import { render } from '@testing-library/react-native';
import { useEffect } from 'react';

import { logWarning } from '../../log';
import { motion } from '../../theme';
import { MAX_CODE_LENGTH } from '../bridge';
import {
  advance,
  call,
  CODE,
  mountPlayer,
  play,
  playingPlayer,
  readyPlayer,
} from '../testing/player';
import { fireWebViewEvent, pagePosts, postRaw, sentToPage, webView } from '../testing/webview';
import { STRUDEL_ERROR, useStrudel } from '../useStrudel';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const IDLE = { playing: false, step: null, error: null, needsNetwork: false };
const warnings = () => jest.mocked(logWarning).mock.calls;

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(logWarning).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useStrudel: waiting for the page', () => {
  it('starts idle, waiting, having sent nothing, and is ready when the page posts ready', () => {
    const before = jest.getTimerCount();
    const { result } = mountPlayer();
    expect(result.current).toMatchObject({ status: 'starting', ...IDLE });
    expect(sentToPage()).toStrictEqual([]);
    expect(jest.getTimerCount()).toBe(before + 1);
    pagePosts({ type: 'ready' });
    expect(result.current.status).toBe('ready');
    expect(jest.getTimerCount()).toBe(before);
    expect(warnings()).toStrictEqual([]);
  });

  it('is unavailable when no ready arrives within 5,000 ms, and logs it once', () => {
    const { result } = mountPlayer();
    advance(4999);
    expect(result.current.status).toBe('starting');
    advance(1);
    expect(result.current).toMatchObject({ status: 'unavailable', ...IDLE });
    pagePosts({ type: 'ready' });
    expect(result.current.status).toBe('unavailable');
    expect(warnings()).toStrictEqual([['strudel_unavailable', { reason: 'timeout' }]]);
  });

  it.each([
    { type: 'step', step: 3 },
    { type: 'error', message: 'early' },
    { type: 'needsNetwork' },
  ])('ignores $type before ready', (message) => {
    const { result } = mountPlayer();
    pagePosts(message);
    expect(result.current).toMatchObject({ status: 'starting', ...IDLE });
  });
});

describe('useStrudel: play and stop', () => {
  it('sends load then play when ready, and is playing', () => {
    const { result } = playingPlayer(CODE);
    expect(sentToPage()).toStrictEqual([{ type: 'load', code: CODE }, { type: 'play' }]);
    expect(result.current).toMatchObject({ status: 'ready', ...IDLE, playing: true });
  });

  it('sends nothing and changes nothing when played while starting', () => {
    const { result } = mountPlayer();
    play(result);
    expect(sentToPage()).toStrictEqual([]);
    expect(result.current).toMatchObject({ status: 'starting', ...IDLE });
  });

  it('sends nothing and reports player_unavailable when played while unavailable', () => {
    const { result } = mountPlayer();
    advance(5000);
    play(result);
    expect(sentToPage()).toStrictEqual([]);
    expect(result.current).toMatchObject({
      playing: false,
      error: STRUDEL_ERROR.playerUnavailable,
    });
  });

  it('sends code of 5,000 characters, but not 5,001: that reports code_too_long', () => {
    const { result } = readyPlayer();
    play(result, 'x'.repeat(MAX_CODE_LENGTH + 1));
    expect(sentToPage()).toStrictEqual([]);
    expect(result.current).toMatchObject({ playing: false, error: STRUDEL_ERROR.codeTooLong });
    play(result, 'x'.repeat(MAX_CODE_LENGTH));
    expect(sentToPage()).toHaveLength(2);
    expect(result.current).toMatchObject({ playing: true, error: null });
  });

  it('follows step messages while playing', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'step', step: 7 });
    expect(result.current.step).toBe(7);
  });

  it('sends stop on stop, and is stopped with no step', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'step', step: 7 });
    call(result, 'stop');
    expect(sentToPage().at(-1)).toStrictEqual({ type: 'stop' });
    expect(result.current).toMatchObject({ playing: false, step: null });
  });

  it('ignores a step or needsNetwork after stop, and a second ready, playing or not', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'ready' });
    expect(result.current).toMatchObject({ status: 'ready', playing: true });
    call(result, 'stop');
    pagePosts({ type: 'step', step: 4 });
    pagePosts({ type: 'needsNetwork' });
    pagePosts({ type: 'ready' });
    expect(result.current).toMatchObject({ status: 'ready', ...IDLE });
  });

  it('shows a page error, stopped, until it is cleared or the next play', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'step', step: 2 });
    pagePosts({ type: 'error', message: 'unknown sound' });
    expect(result.current).toMatchObject({ playing: false, step: null, error: 'unknown sound' });
    call(result, 'clearError');
    expect(result.current.error).toBeNull();
    pagePosts({ type: 'error', message: 'again' });
    play(result);
    expect(result.current).toMatchObject({ playing: true, error: null });
  });

  it('keeps the first 500 characters of a long page error', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'error', message: 'e'.repeat(600) });
    expect(result.current.error).toBe('e'.repeat(500));
  });

  it('exports the three error keys the app itself reports', () => {
    expect(Object.values(STRUDEL_ERROR)).toStrictEqual([
      'code_too_long',
      'player_unavailable',
      'page_silent',
    ]);
  });
});

describe('useStrudel: forged and dropped messages', () => {
  it.each([
    ['a 100,000-character error', JSON.stringify({ type: 'error', message: 'e'.repeat(100_000) })],
    ['a step out of range', JSON.stringify({ type: 'step', step: 16 })],
    ['not JSON', 'secret code here'],
    ['a non-string', { type: 'error', message: 'not a string' }],
    ['a number', 42],
  ])('drops %s: nothing changes', (_name, data) => {
    // What the log says is tested in a fresh session: useStrudel.lifecycle.test.tsx.
    const { result } = playingPlayer();
    pagePosts({ type: 'step', step: 5 });
    postRaw(data);
    expect(result.current).toMatchObject({ status: 'ready', playing: true, step: 5, error: null });
  });

  it('logs dropped messages at most once in the session', () => {
    mountPlayer();
    postRaw('bad');
    const afterFirst = warnings().length;
    expect(afterFirst).toBeLessThanOrEqual(1);
    postRaw('bad again');
    postRaw(7);
    expect(warnings()).toHaveLength(afterFirst);
  });
});

/** A player that is playing without samples, counting the steps itself. */
function countingPlayer() {
  const player = playingPlayer();
  pagePosts({ type: 'needsNetwork' });
  return player;
}

describe('useStrudel: without samples', () => {
  it('counts the steps itself from 0, every beat step, around at 16, still playing', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'step', step: 9 });
    pagePosts({ type: 'needsNetwork' });
    expect(result.current).toMatchObject({ playing: true, needsNetwork: true, step: 0 });
    advance(motion.beatStep);
    expect(result.current.step).toBe(1);
    pagePosts({ type: 'step', step: 12 });
    advance(motion.beatStep * 14);
    expect(result.current).toMatchObject({ playing: true, step: 15 });
    advance(motion.beatStep);
    expect(result.current.step).toBe(0);
  });

  it.each([
    { name: 'stop', message: null },
    { name: 'a page error', message: { type: 'error', message: 'x' } },
  ])('clears its timer on $name, with no step', ({ message }) => {
    const before = jest.getTimerCount();
    const { result } = countingPlayer();
    expect(jest.getTimerCount()).toBe(before + 1);
    if (message === null) {
      call(result, 'stop');
    } else {
      pagePosts(message);
    }
    expect(jest.getTimerCount()).toBe(before);
    expect(result.current).toMatchObject({ playing: false, step: null });
  });

  it('waits for step messages again after the next play', () => {
    const { result } = playingPlayer();
    pagePosts({ type: 'needsNetwork' });
    play(result);
    expect(result.current).toMatchObject({ playing: true, needsNetwork: false, step: null });
    advance(motion.beatStep * 3);
    expect(result.current.step).toBeNull();
    pagePosts({ type: 'step', step: 6 });
    expect(result.current.step).toBe(6);
  });
});

describe('useStrudel: the page goes away', () => {
  it.each([
    { event: 'contentProcessDidTerminate', reason: 'process_gone' },
    { event: 'renderProcessGone', reason: 'process_gone' },
    { event: 'error', reason: 'load_error' },
    { event: 'httpError', reason: 'load_error' },
  ])('is unavailable on $event, stopped, with no timer, logged once', ({ event, reason }) => {
    const before = jest.getTimerCount();
    const { result } = playingPlayer();
    pagePosts({ type: 'needsNetwork' });
    fireWebViewEvent(event);
    fireWebViewEvent(event);
    expect(result.current).toMatchObject({ status: 'unavailable', playing: false, step: null });
    expect(jest.getTimerCount()).toBe(before);
    expect(warnings()).toStrictEqual([['strudel_unavailable', { reason }]]);
    pagePosts({ type: 'step', step: 3 });
    expect(result.current.step).toBeNull();
  });

  it.each([
    { name: 'while playing', setUp: () => playingPlayer(), stops: true },
    { name: 'while counting steps', setUp: () => countingPlayer(), stops: true },
    { name: 'while waiting for ready', setUp: () => mountPlayer(), stops: false },
  ])('leaves no timer when it unmounts $name', ({ setUp, stops }) => {
    const before = jest.getTimerCount();
    const { unmountHook } = setUp();
    const page = webView();
    const sent = page.injected.length;
    unmountHook();
    expect(jest.getTimerCount()).toBe(before);
    expect(page.injected.length - sent).toBe(stops ? 1 : 0);
    advance(10_000);
    expect(warnings()).toStrictEqual([]);
  });

  it('reaches the page with stop when the player unmounts in the same tree as the hook', () => {
    function Screen() {
      const { player, play: start, status } = useStrudel();
      useEffect(() => {
        if (status === 'ready') {
          start(CODE);
        }
      }, [start, status]);
      return player;
    }
    const view = render(<Screen />);
    pagePosts({ type: 'ready' });
    const page = webView();
    view.unmount();
    expect(sentToPage(page)).toStrictEqual([
      { type: 'load', code: CODE },
      { type: 'play' },
      { type: 'stop' },
    ]);
  });
});

describe('useStrudel: reset', () => {
  it('loads a fresh page: starting again, idle, waiting for ready with a new timeout', () => {
    const before = jest.getTimerCount();
    const { result, renderPlayer } = countingPlayer();
    pagePosts({ type: 'error', message: 'boom' });
    const oldPage = webView();
    call(result, 'reset');
    pagePosts({ type: 'ready' });
    fireWebViewEvent('renderProcessGone');
    expect(result.current.status).toBe('starting');
    renderPlayer();
    expect(result.current).toMatchObject({ status: 'starting', ...IDLE });
    expect(webView() === oldPage).toBe(false);
    expect(jest.getTimerCount()).toBe(before + 1);
    pagePosts({ type: 'ready' });
    expect(result.current.status).toBe('ready');
    play(result);
    expect(sentToPage()).toStrictEqual([{ type: 'load', code: CODE }, { type: 'play' }]);
  });

  it('recovers from unavailable, and times out again if the new page never answers', () => {
    const { result, renderPlayer } = mountPlayer();
    advance(5000);
    call(result, 'reset');
    renderPlayer();
    expect(result.current.status).toBe('starting');
    advance(5000);
    expect(result.current.status).toBe('unavailable');
    expect(warnings()).toHaveLength(2);
  });

  it('sends stop to the old page when reset while playing', () => {
    const { result } = playingPlayer();
    call(result, 'reset');
    expect(sentToPage().at(-1)).toStrictEqual({ type: 'stop' });
    expect(result.current.playing).toBe(false);
  });
});
