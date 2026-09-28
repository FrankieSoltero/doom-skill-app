import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Keyboard } from 'react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { parseGrid } from '../../feed/exercise';
import { useFeedStore } from '../../feed/store';
import { makeSet } from '../../feed/testing/sets';
import { border, cardTheme, colors, type } from '../../theme';
import {
  badges,
  button,
  editor,
  FAIL,
  focusedInputs,
  gridProps,
  INDEX,
  isDisabled,
  PASS,
  press,
  renderExerciseCard,
  setUpExerciseCardTests,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';
import { playerMountCount, setAudio, strudelActions } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));

const HIDDEN = { includeHiddenElements: true };
/** The demo code with the hi-hat doubled: it passes the demo check. */
const PASSING = 'stack(\n  s("bd ~ sd ~"),\n  s("hh * 8")\n)';
const announce = jest.mocked(AccessibilityInfo).announceForAccessibility;

const demo = setUpExerciseCardTests();

beforeEach(() => {
  announce.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ExerciseCard content', () => {
  it('shows the demo card on an ink ground: lime kicker, estimate and title, README.md:86-88', () => {
    renderExerciseCard(demo());

    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(colors.ink);
    for (const text of ['Exercise · REPL', '~90 s']) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({
        color: cardTheme.exercise.kicker,
        textTransform: 'uppercase',
      });
    }
    const title = screen.getByRole('header', { name: 'Double the hi-hats to eight per cycle' });
    expect(textStyleOf(title)).toStrictEqual({ ...type.cardTitleS, color: colors.paper });
  });

  it('shows the starter code in a 100 tall editor with a lime caret, README.md:90', () => {
    renderExerciseCard(demo());

    expect(editor()).toHaveDisplayValue(demo().starterCode);
    expect(textStyleOf(editor()).height).toBe(100);
    expect(editor().props).toHaveProperty('selectionColor', colors.lime);
  });

  it('draws the grid of the starter code: bd, sd and hh, README.md:97', () => {
    renderExerciseCard(demo());

    const labels = screen.getAllByTestId('beat-grid-label', HIDDEN);
    expect(labels.map((label) => String(label.props.children))).toStrictEqual(['bd', 'sd', 'hh']);
    expect(gridProps()).toStrictEqual({ rows: parseGrid(demo().starterCode), step: null });
  });

  it('frames the editor, a divider and the grid in a paper border at 25%, README.md:89', () => {
    renderExerciseCard(demo());

    const frame = screen.getByTestId('exercise-editor-frame');
    expect(viewStyleOf(frame)).toStrictEqual({ padding: border.hairline });
    const parts = within(frame).getAllByTestId(
      /^(faded-border|exercise-divider|beat-grid)$/,
      HIDDEN,
    );
    expect(parts.map((part) => String(part.props.testID))).toStrictEqual([
      'faded-border',
      'exercise-divider',
      'beat-grid',
    ]);
    expect(viewStyleOf(within(frame).getByTestId('faded-border'))).toMatchObject({
      borderWidth: border.hairline,
      borderColor: colors.paper,
      opacity: 0.25,
    });
    expect(viewStyleOf(screen.getByTestId('exercise-divider'))).toStrictEqual({
      height: border.hairline,
      backgroundColor: colors.paper,
      opacity: 0.25,
    });
  });

  it('orders the card: title, frame, buttons, spacer, then a paper Next card', () => {
    renderExerciseCard(demo());

    const body = screen.getByTestId('card-frame-body');
    const parts = within(body).getAllByTestId(
      /^(exercise-editor-frame|exercise-controls|exercise-spacer|primary-button-face)$/,
    );
    expect(parts.map((part) => String(part.props.testID))).toStrictEqual([
      'exercise-editor-frame',
      'exercise-controls',
      'exercise-spacer',
      'primary-button-face',
    ]);
    expect(viewStyleOf(screen.getByTestId('exercise-spacer'))).toStrictEqual({ flex: 1 });
    expect(viewStyleOf(screen.getByTestId('primary-button-face')).backgroundColor).toBe(
      colors.paper,
    );
  });

  it('draws no divider or grid for code with no pattern', () => {
    renderExerciseCard(demo());

    typeCode('note("c3")');

    expect(screen.queryByTestId('exercise-divider')).toBeNull();
    expect(screen.queryByTestId('beat-grid', HIDDEN)).toBeNull();
  });
});

describe('ExerciseCard editing and checking', () => {
  it('stores nothing until the learner types, then the code with no result', () => {
    renderExerciseCard(demo());
    expect(storedAnswer()).toBeUndefined();

    typeCode('s("cp*2")');

    expect(storedAnswer()).toStrictEqual({ kind: 'exercise', code: 's("cp*2")', result: null });
    expect(editor()).toHaveDisplayValue('s("cp*2")');
    expect(gridProps().rows).toStrictEqual(parseGrid('s("cp*2")'));
  });

  it('passes code with hh*8: Spec met with the pass message, stored, Next card enabled', () => {
    const { onNext } = renderExerciseCard(demo());

    typeCode(PASSING);
    press('Check');

    expect(badges()).toStrictEqual([PASS]);
    expect(storedAnswer()).toStrictEqual({ kind: 'exercise', code: PASSING, result: 'pass' });
    expect(announce.mock.calls).toStrictEqual([
      ['Spec met. The hi-hat now plays eight times per cycle.'],
    ]);
    expect(isDisabled('Next card')).toBe(false);
    press('Next card');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('fails the starter code: Not yet with the fail message, Next card stays disabled', () => {
    const { onNext } = renderExerciseCard(demo());

    press('Check');

    expect(badges()).toStrictEqual([FAIL]);
    expect(storedAnswer()).toStrictEqual({
      kind: 'exercise',
      code: demo().starterCode,
      result: 'fail',
    });
    expect(announce.mock.calls).toStrictEqual([
      ['Not yet. Change how many times hh repeats inside the cycle.'],
    ]);
    expect(isDisabled('Next card')).toBe(true);
    press('Next card');
    expect(onNext).not.toHaveBeenCalled();
  });

  it('clears the badge and the result when the code is edited after a check', () => {
    renderExerciseCard(demo());
    typeCode(PASSING);
    press('Check');

    typeCode(`${PASSING} `);

    expect(badges()).toStrictEqual([]);
    expect(storedAnswer()).toStrictEqual({
      kind: 'exercise',
      code: `${PASSING} `,
      result: null,
    });
    expect(isDisabled('Next card')).toBe(true);
  });

  it('draws bold in the card messages and speaks them without the markers', () => {
    renderExerciseCard({ ...demo(), passMsg: 'Now **eight** hits.' });
    typeCode(PASSING);

    press('Check');

    expect(screen.getByTestId('bold-span')).toHaveTextContent('eight', { exact: true });
    expect(announce.mock.calls).toStrictEqual([['Spec met. Now eight hits.']]);
  });
});

describe('ExerciseCard stored answer', () => {
  it('restores the stored code and result', () => {
    renderExerciseCard(demo(), {
      answers: { [INDEX]: { kind: 'exercise', code: PASSING, result: 'pass' } },
    });

    expect(editor()).toHaveDisplayValue(PASSING);
    expect(badges()).toStrictEqual([PASS]);
    expect(isDisabled('Next card')).toBe(false);
    expect(announce).not.toHaveBeenCalled();
  });

  it("reads only its own page's answer, and treats another kind of answer as none", () => {
    renderExerciseCard(demo(), {
      answers: {
        [INDEX]: { kind: 'choice', picked: 1 },
        [INDEX + 1]: { kind: 'exercise', code: PASSING, result: 'pass' },
      },
    });

    expect(editor()).toHaveDisplayValue(demo().starterCode);
    expect(badges()).toStrictEqual([]);
    expect(isDisabled('Next card')).toBe(true);
  });

  it('goes back to the starter code when a new set starts', () => {
    renderExerciseCard(demo(), {
      answers: { [INDEX]: { kind: 'exercise', code: PASSING, result: 'fail' } },
    });

    act(() => {
      useFeedStore.getState().startSet(makeSet(13, [demo()]));
    });

    expect(editor()).toHaveDisplayValue(demo().starterCode);
    expect(badges()).toStrictEqual([]);
  });
});

describe('ExerciseCard focus and page changes', () => {
  it('sets the pager focus flag while the editor is focused, and clears it on blur', () => {
    renderExerciseCard(demo());

    fireEvent(editor(), 'focus');
    expect(focusedInputs()).toBe(1);

    fireEvent(editor(), 'blur');
    expect(focusedInputs()).toBe(0);
  });

  it('dismisses the keyboard when it stops being the current page, which clears the flag', () => {
    // The system blurs the focused input when the keyboard is dismissed. Jest has no keyboard, so
    // the spy does what iOS does: it calls the editor's blur handler. It runs inside the card's
    // effect, already in `act`, so it calls the handler directly rather than through `fireEvent`.
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      (editor().props as { onBlur: () => void }).onBlur();
    });
    const { setActive } = renderExerciseCard(demo());
    fireEvent(editor(), 'focus');
    setAudio({ playing: true, step: 3 });

    setActive(true);
    expect(dismiss).not.toHaveBeenCalled();
    expect(strudelActions.stop).not.toHaveBeenCalled();

    setActive(false);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(focusedInputs()).toBe(0);
    expect(strudelActions.stop).toHaveBeenCalledTimes(1);
    expect(button('Play')).toBeOnTheScreen();
  });

  it('does not dismiss the keyboard when drawn off the current page', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');

    renderExerciseCard(demo(), { active: false });

    expect(dismiss).not.toHaveBeenCalled();
  });
});

describe('ExerciseCard player', () => {
  it('renders the player once and never remounts it, whatever the state', () => {
    const { setActive } = renderExerciseCard(demo());
    const steps: (() => void)[] = [
      () => {
        setAudio({ status: 'starting' });
      },
      () => {
        setAudio({ status: 'ready', playing: true, step: 2, needsNetwork: true });
      },
      () => {
        setAudio({ error: 'boom', playing: false });
      },
      () => {
        setAudio({ status: 'unavailable', error: null });
      },
      () => {
        press('Check');
      },
      () => {
        typeCode('');
      },
      () => {
        setActive(false);
      },
    ];

    for (const step of steps) {
      step();
      expect(screen.getAllByTestId('strudel-player')).toHaveLength(1);
    }
    expect(playerMountCount()).toBe(1);
  });
});
