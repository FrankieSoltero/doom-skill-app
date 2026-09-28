import { screen, userEvent, within } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import { gradeCheckpoint } from '../../feed/checkpoint';
import { cardTheme, colors, fonts, type } from '../../theme';
import {
  checkedRows,
  GRADING_MS,
  renderCheckpointCard,
  resultTexts,
  setUpCheckpointCardTests,
} from '../testing/checkpointCards';
import {
  button,
  editor,
  focusedInputs,
  INDEX,
  isDisabled,
  press,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';
import { advance } from '../testing/reviewCards';

const demo = setUpCheckpointCardTests();

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('CheckpointCard content', () => {
  it('shows the demo card on a pink ground: kicker, estimate and title, README.md:124', () => {
    renderCheckpointCard(demo());

    expect(viewStyleOf(screen.getByTestId('card-frame-body')).backgroundColor).toBe(colors.pink);
    expect(cardTheme.checkpoint.bg).toBe(colors.pink);
    for (const text of ['Checkpoint · Milestone 1 of 4', '~3 min']) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({
        color: cardTheme.checkpoint.kicker,
        textTransform: 'uppercase',
      });
    }
    const title = screen.getByRole('header', { name: 'Build a 4-bar drum loop' });
    expect(textStyleOf(title)).toStrictEqual({ ...type.cardTitleS, color: colors.ink });
  });

  it('shows the starter code in a 104 tall editor on an ink panel, with a pink caret, README.md:125', () => {
    renderCheckpointCard(demo());

    expect(editor()).toHaveDisplayValue(demo().starterCode);
    expect(textStyleOf(editor()).height).toBe(104);
    expect(editor().props).toHaveProperty('selectionColor', colors.pink);
    expect(editor().props).toHaveProperty('cursorColor', colors.pink);
    const panel = screen.getByTestId('checkpoint-editor-panel');
    expect(viewStyleOf(panel)).toStrictEqual({ backgroundColor: colors.ink });
    expect(within(panel).getByLabelText('Code editor')).toBe(editor());
  });

  it('lists the four rubric items, none graded, README.md:130-134', () => {
    renderCheckpointCard(demo());

    const rows = screen.getAllByTestId('rubric-row');
    expect(rows.map((row) => row.props.accessibilityLabel as unknown)).toStrictEqual([
      'Kick drum (bd) present. Not graded yet.',
      'Snare or clap (sd / cp) present. Not graded yet.',
      'Hi-hats keep time (hh). Not graded yet.',
      'Pattern changes across bars (< > or .every). Not graded yet.',
    ]);
    expect(checkedRows()).toStrictEqual([false, false, false, false]);
    expect(screen.queryAllByTestId('rubric-check', { includeHiddenElements: true })).toHaveLength(
      0,
    );
  });

  it('offers Submit for grading, enabled, and shows no score before a grade, README.md:136', () => {
    renderCheckpointCard(demo());

    expect(isDisabled('Submit for grading')).toBe(false);
    expect(resultTexts()).toStrictEqual([]);
    expect(screen.getByTestId('checkpoint-result').props).toHaveProperty(
      'accessibilityLiveRegion',
      'polite',
    );
  });

  it('orders the card: kicker row, editor, rubric, result, spacer, then an ink button', () => {
    renderCheckpointCard(demo());

    const body = screen.getByTestId('card-frame-body');
    const parts = within(body).getAllByTestId(
      /^(card-kicker-row|checkpoint-editor-panel|rubric-list|checkpoint-result|checkpoint-spacer|primary-button-face)$/,
    );
    expect(parts.map((part) => String(part.props.testID))).toStrictEqual([
      'card-kicker-row',
      'checkpoint-editor-panel',
      'rubric-list',
      'checkpoint-result',
      'checkpoint-spacer',
      'primary-button-face',
    ]);
    expect(viewStyleOf(screen.getByTestId('checkpoint-spacer'))).toStrictEqual({ flex: 1 });
    expect(viewStyleOf(screen.getByTestId('primary-button-face')).backgroundColor).toBe(colors.ink);
    expect(viewStyleOf(screen.getByTestId('checkpoint-result'))).toStrictEqual({ gap: 2 });
  });
});

describe('CheckpointCard editing', () => {
  it('stores nothing until the learner types, then the code, idle, with no grade', () => {
    renderCheckpointCard(demo());
    expect(storedAnswer()).toBeUndefined();

    typeCode('s("bd*4")');

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: 's("bd*4")',
      status: 'idle',
      grade: null,
    });
    expect(editor()).toHaveDisplayValue('s("bd*4")');
  });

  it('disables Submit for code that is empty or only white space', () => {
    renderCheckpointCard(demo());

    typeCode('');
    expect(isDisabled('Submit for grading')).toBe(true);
    typeCode(' \n  ');
    expect(isDisabled('Submit for grading')).toBe(true);
    typeCode('s("bd")');
    expect(isDisabled('Submit for grading')).toBe(false);
  });

  it('shows the stored code, and treats an answer of another kind as no answer', () => {
    renderCheckpointCard(demo(), {
      answers: { [INDEX]: { kind: 'exercise', code: 's("cp")', result: 'pass' } },
    });

    expect(editor()).toHaveDisplayValue(demo().starterCode);
    expect(button('Submit for grading')).toBeOnTheScreen();
  });

  it('shows code stored at its own index only', () => {
    renderCheckpointCard(demo(), {
      answers: {
        [INDEX]: { kind: 'checkpoint', code: 's("hh*4")', status: 'idle', grade: null },
        [INDEX + 1]: { kind: 'checkpoint', code: 's("sd")', status: 'idle', grade: null },
      },
    });

    expect(editor()).toHaveDisplayValue('s("hh*4")');
  });
});

describe('CheckpointCard stored answers out of step', () => {
  it('shows a grade only with the done status: an idle answer with a grade is not graded', () => {
    const grade = gradeCheckpoint(demo().starterCode, demo());
    renderCheckpointCard(demo(), {
      answers: { [INDEX]: { kind: 'checkpoint', code: 's("bd")', status: 'idle', grade } },
    });

    expect(resultTexts()).toStrictEqual([]);
    expect(checkedRows()).toStrictEqual([false, false, false, false]);
    expect(button('Submit for grading')).toBeOnTheScreen();
  });

  it('offers Submit again for a done answer with no grade', () => {
    renderCheckpointCard(demo(), {
      answers: { [INDEX]: { kind: 'checkpoint', code: 's("bd")', status: 'done', grade: null } },
    });

    expect(resultTexts()).toStrictEqual([]);
    expect(isDisabled('Submit for grading')).toBe(false);
  });
});

describe('CheckpointCard keyboard', () => {
  it('dismisses the keyboard when the card stops being the current page, which blurs the editor', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      // iOS blurs the focused input on dismiss; call the handler, not fireEvent (see lessons).
      (editor().props as { onBlur: () => void }).onBlur();
    });
    const { setActive } = renderCheckpointCard(demo());
    (editor().props as { onFocus: () => void }).onFocus();
    expect(focusedInputs()).toBe(1);

    setActive(false);

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(focusedInputs()).toBe(0);
  });

  it('dismisses the keyboard on Submit and on Resubmit, before grading starts', () => {
    jest.useFakeTimers();
    const seen: unknown[] = [];
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
      const stored = storedAnswer();
      seen.push(stored?.kind === 'checkpoint' ? stored.status : null);
    });
    renderCheckpointCard(demo());
    typeCode('s("bd*4")');

    press('Submit for grading');
    expect(dismiss).toHaveBeenCalledTimes(1);
    advance(GRADING_MS);
    press('Resubmit');

    expect(dismiss).toHaveBeenCalledTimes(2);
    expect(seen).toStrictEqual(['idle', 'done']);
    expect(storedAnswer()).toMatchObject({ status: 'grading' });
  });

  it('dismisses the keyboard on a tap on the card outside the editor and the button', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    renderCheckpointCard(demo());

    const area = screen.getByTestId('dismiss-keyboard-area');
    expect(within(area).getByTestId('card-frame')).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('header', { name: 'Build a 4-bar drum loop' }));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('leaves the keyboard alone when drawn inactive, or while active', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const { setActive } = renderCheckpointCard(demo(), { active: false });

    setActive(false);
    setActive(true);

    expect(dismiss).not.toHaveBeenCalled();
  });
});

describe('CheckpointCard result text', () => {
  it('draws the score line in a 22 heading and the feedback in 13 body text, README.md:139', () => {
    renderCheckpointCard(demo(), {
      answers: {
        [INDEX]: {
          kind: 'checkpoint',
          code: demo().starterCode,
          status: 'done',
          grade: gradeCheckpoint(demo().starterCode, demo()),
        },
      },
    });

    expect(textStyleOf(screen.getByTestId('checkpoint-score'))).toStrictEqual({
      fontFamily: fonts.heading,
      fontSize: 22,
      lineHeight: 34,
      color: colors.ink,
    });
    expect(textStyleOf(screen.getByTestId('checkpoint-feedback'))).toStrictEqual({
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 20,
      color: colors.ink,
    });
  });
});
