// useStrudel against a page that stops answering after `play`: learner code such as
// `while (true) {}` or `document.open()` can leave the page silent, and the card must not show
// Stop forever.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ExerciseCard } from '../../cards/ExerciseCard';
import { demoCard } from '../../cards/testing/demoCards';
import { useFeedStore } from '../../feed/store';
import { logWarning } from '../../log';
import { advance, call, mountPlayer, play, playingPlayer } from '../testing/player';
import { pagePosts, sentToPage } from '../testing/webview';
import { STRUDEL_ERROR } from '../useStrudel';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(logWarning).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** How long the page has to answer a play: resume 3 s, samples 5 s, and a margin. */
const PLAY_LIMIT_MS = 10_000;
/** Long enough for any timer the hook could have left behind to fire. */
const LATER_MS = 60_000;

/** Every warning logged since the test began. */
function warnings(): unknown[][] {
  return jest.mocked(logWarning).mock.calls;
}

describe('useStrudel: a page that stops answering', () => {
  it('stops and fails with page_silent when nothing answers a play for 10 s, logged once', () => {
    const { result } = playingPlayer();

    advance(PLAY_LIMIT_MS - 1);
    expect(result.current.playing).toBe(true);
    advance(1);

    expect(STRUDEL_ERROR.pageSilent).toBe('page_silent');
    expect(result.current).toMatchObject({
      status: 'ready',
      playing: false,
      step: null,
      error: STRUDEL_ERROR.pageSilent,
    });
    expect(sentToPage().at(-1)).toStrictEqual({ type: 'stop' });
    advance(LATER_MS);
    expect(warnings()).toStrictEqual([['strudel_page_silent']]);
  });

  it.each([
    { name: 'a step', message: { type: 'step', step: 1 } },
    { name: 'needsNetwork', message: { type: 'needsNetwork' } },
  ])('does not fail after $name at 9 s, then or later', ({ message }) => {
    const { result } = playingPlayer();
    advance(9000);

    pagePosts(message);
    advance(LATER_MS);

    expect(result.current).toMatchObject({ playing: true, error: null });
    expect(warnings()).toStrictEqual([]);
  });

  it('keeps the page error that arrives at 9 s, and adds none later', () => {
    const { result } = playingPlayer();
    advance(9000);

    pagePosts({ type: 'error', message: 'syntax' });
    advance(LATER_MS);

    expect(result.current).toMatchObject({ playing: false, error: 'syntax' });
    expect(warnings()).toStrictEqual([]);
  });

  it('does not fail after stop at 5 s', () => {
    const { result } = playingPlayer();
    advance(5000);

    call(result, 'stop');
    advance(LATER_MS);

    expect(result.current.error).toBeNull();
    expect(warnings()).toStrictEqual([]);
  });

  it('does not fail after reset at 5 s: only the fresh page may time out', () => {
    const { result } = playingPlayer();
    advance(5000);

    call(result, 'reset');
    advance(LATER_MS);

    expect(result.current.error).toBeNull();
    expect(warnings()).toStrictEqual([['strudel_unavailable', { reason: 'timeout' }]]);
  });

  it('starts the 10 s again on a new play', () => {
    const { result } = playingPlayer();
    advance(5000);

    play(result);
    advance(PLAY_LIMIT_MS - 1);
    expect(result.current.playing).toBe(true);
    advance(1);

    expect(result.current.error).toBe(STRUDEL_ERROR.pageSilent);
    expect(warnings()).toStrictEqual([['strudel_page_silent']]);
  });

  it('neither updates nor logs after unmount', () => {
    const { unmountHook, renders } = playingPlayer();
    advance(5000);

    unmountHook();
    const before = renders();
    advance(LATER_MS);

    expect(renders()).toBe(before);
    expect(warnings()).toStrictEqual([]);
  });
});

describe('the exercise card over a page that stops answering', () => {
  beforeEach(() => {
    useFeedStore.setState(useFeedStore.getInitialState(), true);
  });

  it('shows Audio unavailable with Reset, and Play again', async () => {
    const card = await demoCard('exercise');
    render(<ExerciseCard card={card} index={0} active onNext={jest.fn()} />);
    pagePosts({ type: 'ready' });
    fireEvent.press(screen.getByRole('button', { name: 'Play' }));

    advance(PLAY_LIMIT_MS);

    expect(screen.getByTestId('result-badge-label')).toHaveTextContent('Audio unavailable', {
      exact: true,
    });
    expect(screen.queryByTestId('result-badge-message')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset audio' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
  });
});

describe('useStrudel: the card a player belongs to', () => {
  it('names its card in the timeout log, so a page that did not answer can be traced', () => {
    mountPlayer({ cardId: '00000000-0000-4000-8000-000000000305', cardIndex: 2 });

    advance(5000);

    expect(warnings()).toStrictEqual([
      [
        'strudel_unavailable',
        { reason: 'timeout', cardId: '00000000-0000-4000-8000-000000000305', cardIndex: 2 },
      ],
    ]);
  });
});
