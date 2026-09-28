import { fireEvent, screen } from '@testing-library/react-native';

import { cardsByType } from '../../feed/testing/sets';
import type { CardAnswer } from '../../feed/answers';
import { gradeCheckpoint } from '../../feed/checkpoint';
import { isAnswered } from '../../feed/gating';
import { useFeedStore } from '../../feed/store';
import {
  announce,
  checkedRows,
  GRADING_MS,
  renderCheckpointCard,
  resultTexts,
  setUpCheckpointCardTests,
  struckLabels,
} from '../testing/checkpointCards';
import {
  button,
  editor,
  INDEX,
  isDisabled,
  press,
  storedAnswer,
  typeCode,
} from '../testing/exerciseCards';
import { advance } from '../testing/reviewCards';

/** Kick, snare and hi-hats, but no change across bars: three of the four demo items. */
const THREE = 's("bd sd").stack(s("hh*8"))';
/** A kick drum only: one of the four demo items. */
const ONE = 's("bd*4")';
const GRADING = 'Grading against rubric…';
const ALL = 'Solid loop. The alternating bar gives it movement. Milestone 2 is unlocked.';
const PASS = 'Passes the threshold. Add the missing element to make it a stronger loop.';
const FAIL = 'Needs at least 3 of 4. Check the struck-out items and resubmit.';

const demo = setUpCheckpointCardTests();

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Types `code`, presses Submit and waits out the grading. */
function submitAndGrade(code: string): void {
  typeCode(code);
  press('Submit for grading');
  advance(GRADING_MS);
}

describe('CheckpointCard grading', () => {
  it('grades the starter code after 1,600 ms: 4 of 4, all feedback, Finish today, README.md:137-140', () => {
    renderCheckpointCard(demo());
    press('Submit for grading');

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: demo().starterCode,
      status: 'grading',
      grade: null,
    });
    expect(isDisabled(GRADING)).toBe(true);
    advance(GRADING_MS - 1);
    expect(storedAnswer()).toMatchObject({ status: 'grading', grade: null });
    expect(resultTexts()).toStrictEqual([]);

    advance(1);

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: demo().starterCode,
      status: 'done',
      grade: gradeCheckpoint(demo().starterCode, demo()),
    });
    expect(resultTexts()).toStrictEqual(['Passed · 4 of 4', ALL]);
    expect(checkedRows()).toStrictEqual([true, true, true, true]);
    expect(screen.getAllByTestId('rubric-check', { includeHiddenElements: true })).toHaveLength(4);
    expect(struckLabels(demo())).toStrictEqual([]);
    expect(isDisabled('Finish today')).toBe(false);
  });

  it('passes three of four: Passed · 3 of 4, pass feedback, the missing item struck', () => {
    renderCheckpointCard(demo());

    submitAndGrade(THREE);

    expect(storedAnswer()).toMatchObject({ code: THREE, status: 'done' });
    expect(resultTexts()).toStrictEqual(['Passed · 3 of 4', PASS]);
    expect(checkedRows()).toStrictEqual([true, true, true, false]);
    expect(struckLabels(demo())).toStrictEqual(['Pattern changes across bars (< > or .every)']);
    expect(button('Finish today')).toBeOnTheScreen();
  });

  it('fails one of four: Not yet · 1 of 4, fail feedback, three struck rows, Resubmit', () => {
    renderCheckpointCard(demo());

    submitAndGrade(ONE);

    expect(resultTexts()).toStrictEqual(['Not yet · 1 of 4', FAIL]);
    expect(checkedRows()).toStrictEqual([true, false, false, false]);
    expect(struckLabels(demo())).toStrictEqual([
      'Snare or clap (sd / cp) present',
      'Hi-hats keep time (hh)',
      'Pattern changes across bars (< > or .every)',
    ]);
    expect(isDisabled('Resubmit')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Finish today' })).toBeNull();
  });
});

describe('CheckpointCard after a grade', () => {
  it('counts as answered once graded, passed or not, so the pager lets the learner on', () => {
    renderCheckpointCard(demo());
    submitAndGrade(ONE);

    expect(storedAnswer()).toMatchObject({ status: 'done', grade: { passed: false } });
    expect(isAnswered(demo(), storedAnswer())).toBe(true);
  });

  it('calls onNext once from Finish today', () => {
    const { onNext } = renderCheckpointCard(demo());
    submitAndGrade(demo().starterCode);

    press('Finish today');

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(storedAnswer()).toMatchObject({ status: 'done' });
  });

  it('grades again on Resubmit: grading for 1,600 ms, then a new grade', () => {
    renderCheckpointCard(demo());
    submitAndGrade(ONE);

    press('Resubmit');

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: ONE,
      status: 'grading',
      grade: null,
    });
    expect(isDisabled(GRADING)).toBe(true);
    expect(checkedRows()).toStrictEqual([false, false, false, false]);
    advance(GRADING_MS);
    expect(storedAnswer()).toMatchObject({ status: 'done', grade: gradeCheckpoint(ONE, demo()) });
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('never calls onNext on its own, and Submit does not', () => {
    const { onNext } = renderCheckpointCard(demo());

    submitAndGrade(demo().starterCode);
    advance(GRADING_MS * 3);

    expect(onNext).not.toHaveBeenCalled();
  });
});

describe('CheckpointCard edits reset the grade', () => {
  it('returns to idle with no grade on an edit after a grade', () => {
    renderCheckpointCard(demo());
    submitAndGrade(demo().starterCode);

    typeCode(THREE);

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: THREE,
      status: 'idle',
      grade: null,
    });
    expect(resultTexts()).toStrictEqual([]);
    expect(checkedRows()).toStrictEqual([false, false, false, false]);
    expect(struckLabels(demo())).toStrictEqual([]);
    expect(isDisabled('Submit for grading')).toBe(false);
  });

  it('cancels the grading on an edit during it: no grade for code the learner changed', () => {
    const before = jest.getTimerCount();
    renderCheckpointCard(demo());
    press('Submit for grading');
    expect(jest.getTimerCount()).toBe(before + 1);
    advance(GRADING_MS / 2);

    typeCode(ONE);
    advance(GRADING_MS * 2);

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: ONE,
      status: 'idle',
      grade: null,
    });
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
    expect(announce).not.toHaveBeenCalled();
    expect(isDisabled('Submit for grading')).toBe(false);
  });
});

describe('CheckpointCard timer and unmount', () => {
  it('clears the timer when removed during grading, and writes nothing afterwards', () => {
    const before = jest.getTimerCount();
    const { unmount } = renderCheckpointCard(demo());
    press('Submit for grading');
    const answers = useFeedStore.getState().answers;

    unmount();
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
    advance(GRADING_MS * 2);

    expect(useFeedStore.getState().answers).toBe(answers);
    expect(announce).not.toHaveBeenCalled();
  });

  it('turns a stored grading with no timer into idle on mount, once, keeping the code', () => {
    const before = jest.getTimerCount();
    const stored: CardAnswer = { kind: 'checkpoint', code: THREE, status: 'grading', grade: null };
    renderCheckpointCard(demo(), { answers: { [INDEX]: stored } });

    expect(storedAnswer()).toStrictEqual({ ...stored, status: 'idle' });
    expect(editor()).toHaveDisplayValue(THREE);
    expect(isDisabled('Submit for grading')).toBe(false);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
    advance(GRADING_MS * 2);
    expect(storedAnswer()).toStrictEqual({ ...stored, status: 'idle' });
  });

  it('shows a stored grade as graded, with no timer and no announcement', () => {
    const before = jest.getTimerCount();
    const grade = gradeCheckpoint(ONE, demo());
    const stored: CardAnswer = { kind: 'checkpoint', code: ONE, status: 'done', grade };
    renderCheckpointCard(demo(), { answers: { [INDEX]: stored } });

    expect(resultTexts()).toStrictEqual(['Not yet · 1 of 4', FAIL]);
    expect(button('Resubmit')).toBeOnTheScreen();
    expect(jest.getTimerCount()).toBeLessThanOrEqual(before);
    expect(storedAnswer()).toBe(stored);
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('CheckpointCard announcements', () => {
  it('announces the score and feedback once when the grade arrives, not on a re-render', () => {
    const { setActive } = renderCheckpointCard(demo());
    press('Submit for grading');
    expect(announce).not.toHaveBeenCalled();

    advance(GRADING_MS);
    setActive(false);
    setActive(true);

    expect(announce.mock.calls).toStrictEqual([[`Passed · 4 of 4. ${ALL}`]]);
  });

  it('puts the score and the feedback in a polite live region', () => {
    renderCheckpointCard(demo());
    submitAndGrade(ONE);

    const result = screen.getByTestId('checkpoint-result');
    expect(result.props).toHaveProperty('accessibilityLiveRegion', 'polite');
    expect(result).toHaveTextContent(`Not yet · 1 of 4${FAIL}`);
  });

  it('grades a card with its own rubric and threshold', () => {
    const card = cardsByType.checkpoint;
    renderCheckpointCard(card);

    fireEvent.press(button('Submit for grading'));
    advance(GRADING_MS);

    expect(resultTexts()).toStrictEqual(['Passed · 1 of 1', ALL]);
  });
});
