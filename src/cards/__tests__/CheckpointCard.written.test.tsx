// The written checkpoint card (M9 plan J; J6, J7, J12): a milestone without code checks takes a
// written answer. Nothing is graded on the phone: Submit sends the answer to the server, and the
// button then finishes the set. The server's grade shows under the card as for code. Over the real
// API client and a fake network; nothing leaves the test.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { json, serveApi } from '../../api/testing/fakeApi';
import { textStyleOf } from '../../components/testing/styles';
import type { CheckpointCard as CheckpointCardData } from '../../data';
import * as checkpoint from '../../feed/checkpoint';
import { colors, fonts } from '../../theme';
import {
  announce,
  renderCheckpointCard,
  setUpCheckpointCardTests,
} from '../testing/checkpointCards';
import { button, isDisabled, press, storedAnswer } from '../testing/exerciseCards';

const MILESTONE = '0b7f6c1e-0000-4000-8000-000000000002';
const SUBMISSION = '0b7f6c1e-0000-4000-8000-0000000000bb';
const ANSWER = 'A dividend is a share of profit paid to the owners of a stock.';
const SENT = 'Sent for grading. Your result arrives in about a minute.';
const PENDING_LINE = 'Getting detailed feedback…';
const UNAVAILABLE_LINE = "Detailed feedback isn't available right now.";
/** A grade the server has not given, `status` saying why. */
const ungraded = (status: 'pending' | 'failed') =>
  json(200, { status, passed: null, score: null, feedback: null, criteria: null });

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const demo = setUpCheckpointCardTests();
/** The demo card as the feed serves a milestone without checks: no rubric, no starter code. */
const written = (): CheckpointCardData => ({
  ...demo(),
  written: true,
  rubric: [],
  passThreshold: 0,
  starterCode: '',
});
const served = (): CheckpointCardData => ({ ...written(), id: MILESTONE });

const answerEditor = () => screen.getByLabelText('Your answer');
const typeAnswer = (text: string) => {
  fireEvent.changeText(answerEditor(), text);
};
const posts = (requests: { method: string }[]) => requests.filter((r) => r.method === 'POST');

/** The server's grade of the written answer, `passed` or not. */
function serverGrade(passed: boolean): Response {
  const verdict = { status: 'graded', passed, score: passed ? 0.8 : 0.3 };
  return json(200, { ...verdict, feedback: 'Clear and correct.', criteria: [] });
}

/** Serves the submit, then `polls` in turn for the grade. */
function serveSubmit(polls: Response[]) {
  return serveApi({
    [`POST /milestones/${MILESTONE}/submit`]: [
      json(202, { submission_id: SUBMISSION, status: 'pending' }),
    ],
    [`GET /checkpoints/${SUBMISSION}`]: polls,
  });
}

const wait = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/**
 * Types the answer and presses Submit, then lets the post settle, so the card's poll is scheduled
 * from the moment of the submit.
 */
async function submitAnswer(): Promise<void> {
  typeAnswer(ANSWER);
  press('Submit for grading');
  await wait(0);
}

let grade: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  grade = jest.spyOn(checkpoint, 'gradeCheckpoint');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('a written CheckpointCard before submit', () => {
  it('shows the kicker, the title and an editor labelled Your answer, in the body font, 104 tall', () => {
    renderCheckpointCard(written());

    expect(screen.getByText('Checkpoint · Milestone 1 of 4')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Build a 4-bar drum loop' })).toBeOnTheScreen();
    expect(answerEditor()).toHaveDisplayValue('');
    expect(answerEditor().props).toHaveProperty('placeholder', 'Your answer');
    expect(textStyleOf(answerEditor())).toMatchObject({
      fontFamily: fonts.body,
      height: 104,
      color: colors.paper,
    });
    expect(screen.queryByLabelText('Code editor')).toBeNull();
  });

  it('draws no rubric rows', () => {
    renderCheckpointCard(written());

    expect(screen.queryAllByTestId('rubric-row')).toHaveLength(0);
    expect(screen.queryByTestId('rubric-list')).toBeNull();
  });

  it('disables Submit for grading while the answer is blank', () => {
    renderCheckpointCard(written());

    expect(isDisabled('Submit for grading')).toBe(true);
    typeAnswer('  \n ');
    expect(isDisabled('Submit for grading')).toBe(true);
    typeAnswer(ANSWER);
    expect(isDisabled('Submit for grading')).toBe(false);
    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: ANSWER,
      status: 'idle',
      grade: null,
    });
  });
});

describe('a written CheckpointCard on submit', () => {
  it('grades nothing on the phone, stores sent, sends the answer once with local_passed false', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    const requests = serveSubmit([]);
    renderCheckpointCard(served());
    typeAnswer(ANSWER);

    press('Submit for grading');
    await wait(0);

    expect(grade).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: ANSWER,
      status: 'sent',
      grade: null,
    });
    expect(posts(requests)).toHaveLength(1);
    expect(requests[0]?.body).toStrictEqual({
      client_submission_id: expect.any(String) as unknown,
      code: ANSWER,
      local_passed: false,
    });
    expect(screen.queryAllByTestId('checkpoint-score')).toHaveLength(0);
  });

  it('shows the sent line, announces it, and turns the button into Finish today, which finishes', async () => {
    serveSubmit([]);
    const { onNext } = renderCheckpointCard(served());
    typeAnswer(ANSWER);

    press('Submit for grading');
    await wait(0);

    expect(screen.getByTestId('checkpoint-sent')).toHaveTextContent(SENT);
    expect(announce).toHaveBeenCalledWith(SENT);
    expect(isDisabled('Finish today')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Submit for grading' })).toBeNull();
    press('Finish today');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a demo card, and still finishes', async () => {
    const requests = serveSubmit([]);
    renderCheckpointCard(written());
    typeAnswer(ANSWER);

    press('Submit for grading');
    await wait(10_000);

    expect(requests).toHaveLength(0);
    expect(screen.getByTestId('checkpoint-sent')).toHaveTextContent(SENT);
    expect(button('Finish today')).toBeOnTheScreen();
  });
});

describe("a written CheckpointCard and the server's grade", () => {
  it.each([true, false])(
    'shows the grade (passed %p) as for code, with no comparison',
    async (passed) => {
      serveSubmit([serverGrade(passed)]);
      renderCheckpointCard(served());
      await submitAnswer();
      expect(screen.getByText(PENDING_LINE)).toBeOnTheScreen();

      await wait(3000);

      const verdict = passed ? 'Detailed grade: passed · 80%' : 'Detailed grade: not yet · 30%';
      expect(screen.getByText(verdict)).toBeOnTheScreen();
      expect(screen.getByText('Clear and correct.')).toBeOnTheScreen();
      expect(screen.queryByText('Your milestone progress follows the detailed grade.')).toBeNull();
      expect(isDisabled('Finish today')).toBe(false);
    },
  );

  it('shows the fixed line when no grade comes within the limit; Finish today is unaffected', async () => {
    serveSubmit([ungraded('pending')]);
    renderCheckpointCard(served());
    await submitAnswer();
    await wait(117_000);
    expect(screen.queryByText(UNAVAILABLE_LINE)).toBeNull();

    await wait(3000);

    expect(screen.getByText(UNAVAILABLE_LINE)).toBeOnTheScreen();
    expect(isDisabled('Finish today')).toBe(false);
  });

  it('shows the fixed line when the grading failed; Finish today is unaffected', async () => {
    serveSubmit([ungraded('failed')]);
    renderCheckpointCard(served());
    await submitAnswer();

    await wait(3000);

    expect(screen.getByText(UNAVAILABLE_LINE)).toBeOnTheScreen();
    expect(isDisabled('Finish today')).toBe(false);
  });
});

describe('a written CheckpointCard edited after submit', () => {
  it('goes back to idle, forgets the server result and offers Submit for grading again', async () => {
    serveSubmit([serverGrade(true)]);
    renderCheckpointCard(served());
    await submitAnswer();
    await wait(3000);
    expect(screen.getByText('Clear and correct.')).toBeOnTheScreen();

    typeAnswer(`${ANSWER} More.`);

    expect(storedAnswer()).toStrictEqual({
      kind: 'checkpoint',
      code: `${ANSWER} More.`,
      status: 'idle',
      grade: null,
    });
    expect(screen.queryByText('Clear and correct.')).toBeNull();
    expect(screen.queryByTestId('checkpoint-sent')).toBeNull();
    expect(isDisabled('Submit for grading')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Finish today' })).toBeNull();
  });
});
