// The checkpoint card's keypad (M9 plan K, Task 7; P3, P7, P16): a code checkpoint hands its
// served `keys` to its editor, and the sheet's action key (Submit) submits as the card's Submit
// button does. A written checkpoint keeps the system keyboard. With two editors in one set, the
// keypad shows the focused one's keys only. The sheet is drawn beside the cards, as the feed
// screen draws it. A served card posts over the real API client and a fake network.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { json, serveApi } from '../../api/testing/fakeApi';
import { useOnline } from '../../api/useOnline';
import { KeypadSheet } from '../../components/KeypadSheet';
import type { CheckpointCard as CheckpointCardData } from '../../data';
import type { Keypad } from '../../data/keypadSchema';
import { useKeypad } from '../../feed/keypad';
import { CheckpointCard } from '../CheckpointCard';
import { ExerciseCard } from '../ExerciseCard';
import { GRADING_MS, setUpCheckpointCardTests } from '../testing/checkpointCards';
import {
  editor,
  INDEX,
  setUpExerciseCardTests,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';

// The keypad's haptic tick is native; the exercise beside the checkpoint has a player.
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('../../strudel/useStrudel', () => ({
  ...jest.requireActual<object>('../../strudel/useStrudel'),
  useStrudel: jest.fn(),
}));
jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('../../api/useOnline', () => ({ useOnline: jest.fn() }));

const STACK = { label: 'stack("")', insert: 'stack("")', caret: 2 };
const S_CALL = { label: 's("")', insert: 's("")', caret: 2 };
const KEYS: Keypad = { groups: [{ name: 'calls', keys: [S_CALL] }], action: 'submit' };
const EXERCISE_KEYS: Keypad = { groups: [{ name: 'calls', keys: [STACK] }], action: 'run' };
const CODE = 's("bd ~ sd ~")';
const MILESTONE = '0b7f6c1e-0000-4000-8000-000000000001';
const SUBMISSION = '0b7f6c1e-0000-4000-8000-0000000000aa';
const PENDING = { status: 'pending', passed: null, score: null, feedback: null, criteria: null };

const demo = setUpCheckpointCardTests();
const exerciseDemo = setUpExerciseCardTests();
/** The demo card as the API serves a milestone of a Strudel topic: with its keypad. */
const withKeys = (): CheckpointCardData => ({ ...demo(), keys: KEYS });

beforeEach(() => {
  useKeypad.setState(useKeypad.getInitialState(), true);
  jest.mocked(useOnline).mockReturnValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Draws `card` at INDEX, active, with the keypad sheet after it. */
function renderWithSheet(card: CheckpointCardData) {
  render(
    <>
      <CheckpointCard card={card} index={INDEX} active onNext={jest.fn()} />
      <KeypadSheet />
    </>,
  );
}

const pressKey = (label: string) => {
  fireEvent.press(screen.getByTestId(`keypad-key-${label}`));
};
const shownKeys = () => useKeypad.getState().active?.keys ?? null;

describe('CheckpointCard keypad', () => {
  it('gives its code editor the served keys; a key edits the answer and grades nothing', () => {
    renderWithSheet(withKeys());
    typeCode('');
    fireEvent(editor(), 'focus');

    expect(shownKeys()).toBe(KEYS);
    pressKey(S_CALL.label);

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: 's("")',
      status: 'idle',
      grade: null,
    });
  });

  it('submits the code on Submit as the Submit button does, then hides the sheet', () => {
    jest.useFakeTimers();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    renderWithSheet(withKeys());
    typeCode(CODE);
    fireEvent(editor(), 'focus');

    pressKey('Submit');

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: CODE,
      status: 'grading',
      grade: null,
    });
    expect(dismiss).toHaveBeenCalled();
    expect(shownKeys()).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    act(() => {
      jest.advanceTimersByTime(GRADING_MS);
    });
    expect(storedAnswer()).toMatchObject({ code: CODE, status: 'done' });
  });

  it('submits nothing on Submit while the Submit button is disabled (no code)', () => {
    renderWithSheet(withKeys());
    typeCode(' ');
    fireEvent(editor(), 'focus');

    pressKey('Submit');

    expect(storedAnswer()).toMatchObject({ code: ' ', status: 'idle' });
    expect(shownKeys()).toBeNull();
  });

  it('submits nothing on Submit offline, as the Submit button is disabled', () => {
    jest.mocked(useOnline).mockReturnValue(false);
    renderWithSheet(withKeys());
    typeCode(CODE);
    fireEvent(editor(), 'focus');

    pressKey('Submit');

    expect(storedAnswer()).toMatchObject({ code: CODE, status: 'idle' });
  });

  it('keeps the system keyboard on a written card, whatever it is served', () => {
    renderWithSheet({ ...withKeys(), written: true, rubric: [], passThreshold: 0 });

    fireEvent(screen.getByLabelText('Your answer'), 'focus');

    expect(useKeypad.getState().active).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
  });

  it('keeps the system keyboard on a code card without keys', () => {
    renderWithSheet({ ...demo(), keys: null });

    fireEvent(editor(), 'focus');

    expect(useKeypad.getState().active).toBeNull();
    expect(editor().props).not.toHaveProperty('showSoftInputOnFocus');
  });
});

describe('CheckpointCard keypad Submit once the card is submitted', () => {
  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });

  /**
   * A served card (it has an id) with keys and its starter code, which passes, submitted with the
   * keypad's Submit. Returns the posts the fake network has been sent so far.
   */
  function submitServed() {
    jest.useFakeTimers();
    const requests = serveApi({
      [`POST /milestones/${MILESTONE}/submit`]: [
        json(202, { submission_id: SUBMISSION, status: 'pending' }),
      ],
      [`GET /checkpoints/${SUBMISSION}`]: [json(200, PENDING)],
    });
    renderWithSheet({ ...withKeys(), id: MILESTONE });
    fireEvent(editor(), 'focus');
    pressKey('Submit');
    return () => requests.filter((request) => request.method === 'POST');
  }

  it('grades and posts nothing more on Submit after a pass (the button reads Finish today)', async () => {
    const posts = submitServed();
    await advance(GRADING_MS);
    const graded = storedAnswer();
    expect(graded).toMatchObject({ status: 'done', grade: { passed: true } });
    expect(screen.getByRole('button', { name: 'Finish today' })).toBeOnTheScreen();
    expect(posts()).toHaveLength(1);

    fireEvent(editor(), 'focus');
    pressKey('Submit');
    await advance(GRADING_MS);

    expect(storedAnswer()).toBe(graded);
    expect(posts()).toHaveLength(1);
  });

  it('grades and posts nothing more on Submit while grading: the first grading ends on time', async () => {
    const posts = submitServed();
    await advance(GRADING_MS / 2);
    const grading = storedAnswer();
    expect(grading).toMatchObject({ status: 'grading' });

    fireEvent(editor(), 'focus');
    pressKey('Submit');
    expect(storedAnswer()).toBe(grading);
    await advance(GRADING_MS / 2);

    expect(storedAnswer()).toMatchObject({ status: 'done', grade: { passed: true } });
    expect(posts()).toHaveLength(1);
  });
});

describe('CheckpointCard keypad beside an exercise', () => {
  /** The exercise card at 0 and the checkpoint at INDEX, both with keys, and the sheet. */
  function renderSet() {
    render(
      <>
        <ExerciseCard
          card={{ ...exerciseDemo(), keys: EXERCISE_KEYS }}
          index={0}
          active={false}
          onNext={jest.fn()}
        />
        <CheckpointCard card={withKeys()} index={INDEX} active onNext={jest.fn()} />
        <KeypadSheet />
      </>,
    );
    const [exerciseEditor, checkpointEditor] = screen.getAllByLabelText('Code editor');
    if (exerciseEditor === undefined || checkpointEditor === undefined)
      throw new Error('2 editors');
    return { exerciseEditor, checkpointEditor };
  }

  it("shows only the focused editor's keys, whichever order focus and blur come in", () => {
    const { exerciseEditor, checkpointEditor } = renderSet();

    fireEvent(exerciseEditor, 'focus');
    expect(shownKeys()).toBe(EXERCISE_KEYS);
    expect(screen.getByTestId(`keypad-key-${STACK.label}`)).toBeOnTheScreen();

    // The checkpoint's focus comes before the exercise's blur: the late blur keeps its keys.
    fireEvent(checkpointEditor, 'focus');
    fireEvent(exerciseEditor, 'blur');
    expect(shownKeys()).toBe(KEYS);
    expect(screen.getByTestId(`keypad-key-${S_CALL.label}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`keypad-key-${STACK.label}`)).toBeNull();
    expect(screen.getAllByTestId('keypad-sheet')).toHaveLength(1);
  });
});
