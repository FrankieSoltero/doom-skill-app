import { act, screen, userEvent, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { renderRouter } from 'expo-router/testing-library';
import { AccessibilityInfo, AppState, Keyboard, Text } from 'react-native';

import { viewStyleOf } from '../../components/testing/styles';
import { pagePosts, sentToPage } from '../../strudel/testing/webview';
import { STRUDEL_ERROR, useStrudel } from '../../strudel/useStrudel';
import { ExerciseCard } from '../ExerciseCard';
import {
  badges,
  button,
  FAIL,
  FAIL_SPOKEN,
  gridProps,
  INDEX,
  isDisabled,
  press,
  renderExerciseCard,
  setUpExerciseCardTests,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';
import { setAudio, strudelActions } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const HIDDEN = { includeHiddenElements: true };
const { play, stop, clearError, reset } = strudelActions;
const announce = jest.mocked(AccessibilityInfo).announceForAccessibility;

const demo = setUpExerciseCardTests();

beforeEach(() => {
  jest.mocked(AppState).addEventListener.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('ExerciseCard Play and Stop', () => {
  it('plays the current code after clearing any error, then shows Stop, which stops', () => {
    renderExerciseCard(demo());
    typeCode('s("bd*2")');

    press('Play');

    expect(play.mock.calls).toStrictEqual([['s("bd*2")']]);
    expect(clearError.mock.invocationCallOrder[0]).toBeLessThan(
      play.mock.invocationCallOrder[0] ?? 0,
    );
    press('Stop');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(button('Play')).toBeOnTheScreen();
  });

  it("passes the hook's step to the grid while playing, and none once stopped", () => {
    renderExerciseCard(demo());
    press('Play');

    setAudio({ step: 5 });
    expect(gridProps().step).toBe(5);

    press('Stop');
    expect(gridProps().step).toBeNull();
    setAudio({ step: 7 });
    expect(gridProps().step).toBeNull();
  });

  it('does not restart playback when the code is edited while playing', () => {
    renderExerciseCard(demo());
    press('Play');

    typeCode('s("hh*8")');

    expect(play).toHaveBeenCalledTimes(1);
    expect(button('Stop')).toBeOnTheScreen();
    expect(stop).not.toHaveBeenCalled();
  });

  it.each([
    ['the code is empty', {}, ''],
    ['the code is only spaces', {}, ' \n '],
    ['the player is starting', { status: 'starting' as const }, null],
    ['the player is unavailable', { status: 'unavailable' as const }, null],
    ['there is an audio error', { error: 'boom' }, null],
  ])('disables Play when %s', (_, audio, code) => {
    renderExerciseCard(demo());
    if (code !== null) typeCode(code);
    setAudio(audio);

    press('Play');

    expect(isDisabled('Play')).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it('enables Play again when the code changes after an audio error', () => {
    renderExerciseCard(demo());
    setAudio({ error: 'boom' });

    typeCode('s("bd")');

    expect(clearError).toHaveBeenCalledTimes(1);
    expect(isDisabled('Play')).toBe(false);
    expect(badges()).toStrictEqual([]);
  });

  it('does not clear the audio state on an edit when there is no error', () => {
    renderExerciseCard(demo());

    typeCode('s("bd")');

    expect(clearError).not.toHaveBeenCalled();
  });
});

describe('ExerciseCard audio notices', () => {
  it("says audio needs a connection while playing, and the grid follows the hook's step", () => {
    renderExerciseCard(demo());
    press('Play');

    setAudio({ needsNetwork: true, step: 0 });
    expect(badges()).toStrictEqual(['Audio needs a connection']);
    setAudio({ step: 4 });
    expect(gridProps().step).toBe(4);
  });

  it('says audio is unavailable; Check shows, stores and speaks its result in its place', () => {
    renderExerciseCard(demo());
    setAudio({ status: 'unavailable' });

    press('Check');

    expect(badges()).toStrictEqual([FAIL]);
    expect(storedAnswer()).toMatchObject({ result: 'fail' });
    expect(announce).toHaveBeenLastCalledWith(FAIL_SPOKEN);
  });

  it('checks while playing without stopping', () => {
    renderExerciseCard(demo());
    press('Play');

    press('Check');

    expect(badges()).toStrictEqual([FAIL]);
    expect(stop).not.toHaveBeenCalled();
    expect(button('Stop')).toBeOnTheScreen();
  });

  it.each([
    {
      name: 'the long-code key',
      error: STRUDEL_ERROR.codeTooLong,
      shown: 'The code is too long to play',
    },
    {
      name: 'the unavailable key',
      error: STRUDEL_ERROR.playerUnavailable,
      shown: 'Audio unavailable',
    },
    { name: 'page text with markup', error: 'E: **b** <b>t</b>', shown: 'E: **b** <b>t</b>' },
    { name: '1,000 characters of page text', error: 'x'.repeat(1000), shown: 'x'.repeat(200) },
  ])('shows $name as a plain text audio error', ({ error, shown }) => {
    renderExerciseCard(demo());

    setAudio({ error });

    expect(badges()).toStrictEqual([`Audio error: ${shown}`]);
    expect(screen.queryByTestId('bold-span')).toBeNull();
  });

  it('resets the player from the notice, and Play waits until it is ready', () => {
    renderExerciseCard(demo());
    setAudio({ status: 'unavailable', error: STRUDEL_ERROR.playerUnavailable });

    press('Reset audio');

    expect(reset).toHaveBeenCalledTimes(1);
    expect(clearError).toHaveBeenCalledTimes(1);
    expect(badges()).toStrictEqual([]);
    expect(isDisabled('Play')).toBe(true);
    setAudio({ status: 'ready' });
    expect(isDisabled('Play')).toBe(false);
  });
});

describe('ExerciseCard stops when away', () => {
  it('stops when the app goes to the background', () => {
    renderExerciseCard(demo());
    press('Play');
    const [call] = jest.mocked(AppState).addEventListener.mock.calls;
    if (call === undefined) throw new Error('no app state listener');

    act(() => {
      call[1]('background');
    });

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('stops when its screen loses focus to another tab', () => {
    const card = () => <ExerciseCard card={demo()} index={INDEX} active onNext={jest.fn()} />;
    renderRouter(
      { _layout: () => <Tabs />, index: card, other: () => <Text>other</Text> },
      { initialUrl: '/' },
    );
    press('Play');

    act(() => {
      router.navigate('/other');
    });

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('ExerciseCard keyboard', () => {
  it.each([
    { name: 'Play', setUp: () => undefined, action: play },
    {
      name: 'Stop',
      setUp: () => {
        setAudio({ playing: true });
      },
      action: stop,
    },
    {
      name: 'Reset audio',
      setUp: () => {
        setAudio({ status: 'unavailable' });
      },
      action: reset,
    },
  ])('dismisses the keyboard before $name acts', ({ name, setUp, action }) => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    renderExerciseCard(demo());
    setUp();

    press(name);

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(
      action.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('dismisses the keyboard before Check stores its result', () => {
    const seen: unknown[] = [];
    jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      seen.push(storedAnswer());
    });
    renderExerciseCard(demo());

    press('Check');

    expect(seen).toStrictEqual([undefined]);
    expect(storedAnswer()).toMatchObject({ result: 'fail' });
  });

  it('dismisses the keyboard on a tap on the card outside the editor and the buttons', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    renderExerciseCard(demo());

    const area = screen.getByTestId('dismiss-keyboard-area');
    expect(within(area).getByTestId('card-frame')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByText('Exercise · REPL'));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

/** The column the grid's first row lights as the playhead, or null for none. */
function shownPlayhead(): number | null {
  const [row] = screen.getAllByTestId('beat-grid-row', HIDDEN);
  if (row === undefined) throw new Error('no grid row');
  const cells = within(row).getAllByTestId('beat-grid-cell', HIDDEN);
  const column = cells.findIndex((cell) => {
    const style = viewStyleOf(cell);
    return style.opacity === 0.35 || style.transform !== undefined;
  });
  return column === -1 ? null : column;
}

/** Moves fake time on by `ms`, inside `act`. */
function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('ExerciseCard with the real useStrudel', () => {
  it('agrees with the hook: plays, follows page steps, then counts itself without samples', () => {
    jest.useFakeTimers();
    const actual = jest.requireActual<{ useStrudel: typeof useStrudel }>(
      '../../strudel/useStrudel',
    );
    jest.mocked(useStrudel).mockImplementation(actual.useStrudel);
    const { unmount } = renderExerciseCard(demo());
    expect(isDisabled('Play')).toBe(true);

    pagePosts({ type: 'ready' });
    press('Play');
    expect(sentToPage()).toStrictEqual([
      { type: 'load', code: demo().starterCode },
      { type: 'play' },
    ]);
    pagePosts({ type: 'step', step: 5 });
    expect(shownPlayhead()).toBe(5);

    pagePosts({ type: 'needsNetwork' });
    expect(badges()).toStrictEqual(['Audio needs a connection']);
    expect(shownPlayhead()).toBe(0);
    advance(140);
    expect(shownPlayhead()).toBe(1);
    advance(280);
    expect(shownPlayhead()).toBe(3);

    press('Stop');
    expect(shownPlayhead()).toBeNull();
    expect(sentToPage().at(-1)).toStrictEqual({ type: 'stop' });
    unmount();
  });
});
