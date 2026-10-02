// The logic of a code block that plays (M9 plan I Task 3): the autoplay-once-per-visit rule (X2),
// Play and Stop, and stopping when the card is left. The player is the Strudel test double.
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { useStrudel } from '../../strudel/useStrudel';
import {
  resetStrudelDouble,
  setAudio,
  strudelActions,
  useStrudelDouble,
} from '../testing/strudelDouble';
import { usePlayableCode } from '../usePlayableCode';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const CODE = 'note("<c3 e3 g3>")';
const OWNER = { cardIndex: 2, cardId: 'card-2' };
const { play, stop } = strudelActions;

type Props = { active: boolean; autoplay: boolean };

/** The hook for CODE, owned by OWNER, with `active` and `autoplay` as given. */
function renderPlayable(initial: Props) {
  return renderHook((props: Props) => usePlayableCode({ code: CODE, owner: OWNER, ...props }), {
    initialProps: initial,
  });
}

/** Tells every app state listener the hook added that the app is now `state`. */
function appBecomes(state: AppStateStatus): void {
  const listeners = jest.mocked(AppState).addEventListener.mock.calls.map((call) => call[1]);
  expect(listeners.length).toBeGreaterThan(0);
  act(() => {
    listeners.forEach((listener) => {
      listener(state);
    });
  });
}

beforeEach(() => {
  resetStrudelDouble();
  jest.mocked(useStrudel).mockClear().mockImplementation(useStrudelDouble);
  jest.mocked(AppState).addEventListener.mockClear();
});

describe('usePlayableCode autoplay (X2)', () => {
  it('names its player after the card', () => {
    renderPlayable({ active: false, autoplay: true });

    expect(jest.mocked(useStrudel)).toHaveBeenCalledWith(OWNER);
  });

  it('plays the code once when it is active and the player is ready', () => {
    const { rerender, result } = renderPlayable({ active: true, autoplay: true });

    rerender({ active: true, autoplay: true });

    expect(play.mock.calls).toStrictEqual([[CODE]]);
    expect(result.current.playing).toBe(true);
  });

  it('plays once when the player becomes ready after the card is already active', () => {
    setAudio({ status: 'starting' });
    renderPlayable({ active: true, autoplay: true });
    expect(play).not.toHaveBeenCalled();

    setAudio({ status: 'ready' });
    setAudio({ step: 3 });

    expect(play.mock.calls).toStrictEqual([[CODE]]);
  });

  it('plays when an inactive card becomes active, and not before', () => {
    const { rerender } = renderPlayable({ active: false, autoplay: true });
    expect(play).not.toHaveBeenCalled();

    rerender({ active: true, autoplay: true });

    expect(play.mock.calls).toStrictEqual([[CODE]]);
  });

  it('does not play by itself while the player reports an error, as Play is disabled then', () => {
    setAudio({ error: 'ReferenceError: nope is not defined' });
    const { rerender } = renderPlayable({ active: true, autoplay: true });

    rerender({ active: true, autoplay: true });
    setAudio({ step: 1 });

    expect(play).not.toHaveBeenCalled();
  });

  it('never plays by itself without autoplay', () => {
    const { rerender } = renderPlayable({ active: true, autoplay: false });

    rerender({ active: false, autoplay: false });
    rerender({ active: true, autoplay: false });

    expect(play).not.toHaveBeenCalled();
  });

  it('stops when the card is left, and plays again when it comes back', () => {
    const { rerender } = renderPlayable({ active: true, autoplay: true });

    rerender({ active: false, autoplay: true });
    expect(stop).toHaveBeenCalledTimes(1);
    rerender({ active: true, autoplay: true });

    expect(play.mock.calls).toStrictEqual([[CODE], [CODE]]);
  });

  it('does not start again within the visit after the player is reset and ready again', () => {
    renderPlayable({ active: true, autoplay: true });

    setAudio({ status: 'starting', playing: false });
    setAudio({ status: 'ready' });

    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stops when the app goes to the background, not when it is only inactive', () => {
    renderPlayable({ active: true, autoplay: true });

    appBecomes('inactive');
    expect(stop).not.toHaveBeenCalled();
    appBecomes('background');

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('usePlayableCode toggle', () => {
  it('stops while playing, and nothing restarts it while the card stays active', () => {
    const { rerender, result } = renderPlayable({ active: true, autoplay: true });

    act(() => {
      result.current.toggle();
    });
    rerender({ active: true, autoplay: true });
    setAudio({ status: 'ready' });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(result.current.playing).toBe(false);
  });

  it('plays the code while stopped', () => {
    const { result } = renderPlayable({ active: true, autoplay: false });

    act(() => {
      result.current.toggle();
    });

    expect(play.mock.calls).toStrictEqual([[CODE]]);
    expect(result.current.playing).toBe(true);
    expect(result.current.strudel.playing).toBe(true);
  });
});
