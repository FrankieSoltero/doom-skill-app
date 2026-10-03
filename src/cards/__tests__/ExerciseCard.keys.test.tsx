// The exercise card's keypad (M9 plan K, Task 7; P7, P16): the card hands its served `keys` to its
// editor, and the sheet's action key (▶ Run) runs the card's own Run: Play on a Strudel card, as
// the Play button does, and Check on a card the app can only check. A card without keys keeps the
// system keyboard and never touches the keypad. The sheet is drawn beside the card, as the feed
// screen draws it.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { KeypadSheet } from '../../components/KeypadSheet';
import type { ExerciseCard as ExerciseCardData } from '../../data';
import type { Keypad } from '../../data/keypadSchema';
import { useKeypad } from '../../feed/keypad';
import { useFeedStore } from '../../feed/store';
import { ExerciseCard } from '../ExerciseCard';
import {
  editor,
  focusedInputs,
  INDEX,
  setUpExerciseCardTests,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';
import { setAudio, strudelActions } from '../testing/strudelDouble';

jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const S_CALL = { label: 's("")', insert: 's("")', caret: 2 };
const KEYS: Keypad = { groups: [{ name: 'calls', keys: [S_CALL] }], action: 'run' };
const { play } = strudelActions;

const demo = setUpExerciseCardTests();
/** The demo card as the API serves a Strudel node with examples: with its keypad. */
const withKeys = (): ExerciseCardData => ({ ...demo(), keys: KEYS });

beforeEach(() => {
  useKeypad.setState(useKeypad.getInitialState(), true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Draws `card` at INDEX, active, with the keypad sheet after it. */
function renderWithSheet(card: ExerciseCardData) {
  render(
    <>
      <ExerciseCard card={card} index={INDEX} active onNext={jest.fn()} />
      <KeypadSheet />
    </>,
  );
}

const focus = () => {
  fireEvent(editor(), 'focus');
};
const pressKey = (label: string) => {
  fireEvent.press(screen.getByTestId(`keypad-key-${label}`));
};
const shownKeys = () => useKeypad.getState().active?.keys ?? null;

describe('ExerciseCard keypad', () => {
  it('gives its editor the served keys: focus shows them, in place of the system keyboard', () => {
    renderWithSheet(withKeys());

    focus();

    expect(shownKeys()).toBe(KEYS);
    expect(screen.getByTestId('keypad-sheet')).toBeOnTheScreen();
    expect((editor().props as { showSoftInputOnFocus?: boolean }).showSoftInputOnFocus).toBe(false);
    // The feed's focus flag is set, so the pager keeps its swipe off (P7).
    expect(focusedInputs()).toBe(1);
  });

  it('closes the sheet on a tap on the card outside the editor: the dismiss blurs the editor', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    renderWithSheet(withKeys());
    focus();

    fireEvent.press(screen.getByTestId('dismiss-keyboard-area'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    // What the dismiss does natively: the focused editor blurs.
    fireEvent(editor(), 'blur');

    expect(shownKeys()).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(focusedInputs()).toBe(0);
  });

  it("writes a key's text into the card's answer", () => {
    renderWithSheet(withKeys());
    typeCode('');
    focus();

    pressKey(S_CALL.label);

    expect(storedAnswer()).toStrictEqual({ kind: 'exercise', code: 's("")', result: null });
  });

  it.each([
    ['absent', demo],
    ['null', (): ExerciseCardData => ({ ...demo(), keys: null })],
  ])('keeps the system keyboard and no keypad when its keys are %s', (_, card) => {
    renderWithSheet(card());

    focus();

    expect(useKeypad.getState().active).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(editor().props).not.toHaveProperty('showSoftInputOnFocus');
    expect(useFeedStore.getState().answers).toStrictEqual({});
  });
});

describe('ExerciseCard keypad ▶ Run', () => {
  it('runs the code on ▶ Run as Play does, then hides the sheet', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    renderWithSheet(withKeys());
    typeCode('s("bd*2")');
    focus();

    pressKey('▶ Run');

    expect(play.mock.calls).toStrictEqual([['s("bd*2")']]);
    expect(dismiss).toHaveBeenCalled();
    expect(shownKeys()).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
  });

  it('plays the code again on ▶ Run while it plays: the key never stops it', () => {
    renderWithSheet(withKeys());
    typeCode('s("bd*2")');
    setAudio({ playing: true });
    focus();

    pressKey('▶ Run');

    expect(play.mock.calls).toStrictEqual([['s("bd*2")']]);
    expect(strudelActions.stop).not.toHaveBeenCalled();
  });

  it.each([
    ['the code is empty', {}, ''],
    ['the player is starting', { status: 'starting' as const }, 's("bd")'],
  ])(
    'plays nothing on ▶ Run while Play is disabled (%s), and hides the sheet',
    (_, audio, code) => {
      renderWithSheet(withKeys());
      setAudio(audio);
      typeCode(code);
      focus();

      pressKey('▶ Run');

      expect(play).not.toHaveBeenCalled();
      expect(shownKeys()).toBeNull();
    },
  );

  it('checks the code on ▶ Run on a card the app only checks', () => {
    const checks = [{ kind: 'contains' as const, value: 'OVER', ignoreWhitespace: true }];
    const sql: ExerciseCardData = { ...withKeys(), lang: 'sql', checks };
    renderWithSheet(sql);
    typeCode('SELECT rank() OVER () FROM t;');
    focus();

    pressKey('▶ Run');

    expect(storedAnswer()).toStrictEqual({
      kind: 'exercise',
      code: 'SELECT rank() OVER () FROM t;',
      result: 'pass',
    });
    expect(play).not.toHaveBeenCalled();
    expect(shownKeys()).toBeNull();
  });
});
