// The checkpoint card with the server's grade: a card the API served (it has an id) posts the
// code once the on-phone result shows, and shows the grade under it; the on-phone result still
// decides the button. Over the real API client and a fake network; nothing leaves the test.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { json, serveApi } from '../../api/testing/fakeApi';
import type { CheckpointCard as CheckpointCardData } from '../../data';
import { activeTopic, loadActiveTopic } from '../../feed/useActiveTopic';
import {
  GRADING_MS,
  renderCheckpointCard,
  resultTexts,
  setUpCheckpointCardTests,
} from '../testing/checkpointCards';
import { button, press, typeCode } from '../testing/exerciseCards';

const MILESTONE = '0b7f6c1e-0000-4000-8000-000000000001';
const SUBMISSION = '0b7f6c1e-0000-4000-8000-0000000000aa';
const PENDING_LINE = 'Getting detailed feedback…';
const UNAVAILABLE_LINE = "Detailed feedback isn't available right now.";
/** A kick drum only: one of the four demo items, a fail on the phone. */
const ONE = 's("bd*4")';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('expo-router', () => ({ router: { dismissTo: jest.fn() } }));

const demo = setUpCheckpointCardTests();
const served = (): CheckpointCardData => ({ ...demo(), id: MILESTONE });

const grade = (passed: boolean, level: Record<string, unknown> | null = null) =>
  json(200, {
    status: 'graded',
    passed,
    score: passed ? 0.9 : 0.2,
    feedback: passed ? 'A full groove.' : 'Only a kick.',
    criteria: [{ name: 'rhythm', score: 0.5, justification: 'One voice.' }],
    level,
  });
/** The level the pass finished (M10 plan L): level 1, its points, the learner in level 2. */
const LEVEL = {
  completed: true,
  level: 1,
  next: 'enrolled',
  next_slug: 'strudel-level-2',
  points: 100,
};
const COMPLETED = 'Level 1 complete · +100 points';
const PENDING = { status: 'pending', passed: null, score: null, feedback: null, criteria: null };

function serve(polls: Response[]) {
  return serveApi({
    [`POST /milestones/${MILESTONE}/submit`]: [
      json(202, { submission_id: SUBMISSION, status: 'pending' }),
    ],
    [`GET /checkpoints/${SUBMISSION}`]: polls,
  });
}

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('CheckpointCard with the server grade', () => {
  it('posts nothing for a demo card, and draws nothing more', async () => {
    const requests = serve([grade(true)]);
    renderCheckpointCard(demo());
    press('Submit for grading');
    await advance(GRADING_MS + 10_000);

    expect(requests).toHaveLength(0);
    expect(screen.queryByText(PENDING_LINE)).toBeNull();
    expect(resultTexts()[0]).toBe('Passed · 4 of 4');
  });

  it('posts the code with the on-phone result once it shows, then shows the grade', async () => {
    const requests = serve([json(200, PENDING), grade(true)]);
    renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS - 1);
    expect(requests).toHaveLength(0);

    await advance(1);
    expect(resultTexts()[0]).toBe('Passed · 4 of 4');
    expect(requests[0]?.body).toStrictEqual({
      client_submission_id: expect.any(String) as unknown,
      code: demo().starterCode,
      local_passed: true,
    });
    expect(screen.getByText(PENDING_LINE)).toBeTruthy();

    await advance(6000);
    expect(screen.queryByText(PENDING_LINE)).toBeNull();
    expect(screen.getByText('Detailed grade: passed · 90%')).toBeTruthy();
    expect(screen.getByText('A full groove.')).toBeTruthy();
    expect(screen.getByText('One voice.')).toBeTruthy();
    expect(button('Finish today')).toBeTruthy();
  });

  it('keeps the on-phone gate when the server passes code the phone failed', async () => {
    const requests = serve([grade(true)]);
    renderCheckpointCard(served());
    typeCode(ONE);
    press('Submit for grading');
    await advance(GRADING_MS + 3000);

    expect(requests[0]?.body).toMatchObject({ code: ONE, local_passed: false });
    expect(screen.getByText('Detailed grade: passed · 90%')).toBeTruthy();
    expect(screen.getByText('Your milestone progress follows the detailed grade.')).toBeTruthy();
    expect(button('Resubmit')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Finish today' })).toBeNull();
  });

  it('keeps Finish today when the server does not pass code the phone passed', async () => {
    serve([grade(false)]);
    renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS + 3000);

    expect(screen.getByText('Detailed grade: not yet · 20%')).toBeTruthy();
    expect(button('Finish today')).toBeTruthy();
  });

  it('shows the fixed line when the submit is refused, and the on-phone result stands', async () => {
    serveApi({ [`POST /milestones/${MILESTONE}/submit`]: [json(429, { detail: 'Slow down' })] });
    renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS);

    expect(screen.getByText(UNAVAILABLE_LINE)).toBeTruthy();
    expect(screen.queryByText('Slow down')).toBeNull();
    expect(resultTexts()[0]).toBe('Passed · 4 of 4');
  });

  it('clears the grade when the code is edited', async () => {
    serve([grade(true)]);
    renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS + 3000);
    typeCode(ONE);

    expect(screen.queryByText('A full groove.')).toBeNull();
  });

  it('stops asking when the card leaves the screen', async () => {
    const requests = serve([json(200, PENDING)]);
    const { setActive } = renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS);
    setActive(false);
    await advance(30_000);

    expect(requests.filter((r) => r.method === 'GET')).toHaveLength(0);
  });
});

describe('CheckpointCard with a level the pass finished (M10 plan L, L21)', () => {
  // Continue makes a level the active topic, module state that outlives a case: forget it.
  afterEach(async () => {
    await AsyncStorage.clear();
    await loadActiveTopic();
  });

  it("shows the unlock in the rubric's place; Continue replaces Finish today", async () => {
    serve([grade(true, LEVEL)]);
    renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS + 3000);

    expect(screen.getByText(COMPLETED)).toBeTruthy();
    expect(screen.queryByTestId('rubric-list')).toBeNull();
    expect(resultTexts()[0]).toBe('Passed · 4 of 4');
    expect(
      screen.getAllByRole('button', { name: /^(Continue to Level 2|Finish today)$/ }),
    ).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Finish today' })).toBeNull();
    press('Continue to Level 2');

    expect(activeTopic()).toBe('strudel-level-2');
    expect(router.dismissTo).toHaveBeenCalledWith('/');
  });

  it('keeps Finish today, with the line about the next level, when not enrolled in it', async () => {
    serve([grade(true, { ...LEVEL, next: 'waiting', next_slug: null })]);
    const { onNext } = renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS + 3000);

    expect(screen.getByText('Level 2 is nearly ready.')).toBeTruthy();
    expect(screen.queryByTestId('rubric-list')).toBeNull();
    press('Finish today');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('a written card drops its sent line for the unlock, the grade standing for it', async () => {
    serve([grade(true, LEVEL)]);
    const written = { written: true, rubric: [], passThreshold: 0, starterCode: 'An answer.' };
    renderCheckpointCard({ ...served(), ...written });
    press('Submit for grading');
    await advance(0);
    expect(screen.getByTestId('checkpoint-sent')).toBeTruthy();
    await advance(3000);

    expect(screen.getByText(COMPLETED)).toBeTruthy();
    expect(screen.queryByTestId('checkpoint-sent')).toBeNull();
    expect(button('Continue to Level 2')).toBeTruthy();
  });

  it.each([
    ['a grade without a level', null],
    ['a level not completed', { ...LEVEL, completed: false }],
  ])('shows no unlock for %s', async (_name, level) => {
    serve([grade(true, level)]);
    renderCheckpointCard(served());
    press('Submit for grading');
    await advance(GRADING_MS + 3000);

    expect(screen.getByText('Detailed grade: passed · 90%')).toBeTruthy();
    expect(screen.queryByTestId('level-unlock')).toBeNull();
    expect(screen.getByTestId('rubric-list')).toBeTruthy();
    expect(button('Finish today')).toBeTruthy();
  });
});
