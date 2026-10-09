// The projects of a level 2 in the server's grade of a checkpoint (src/feed/useCheckpointResult.ts;
// M11 plan Task 21, decision M21): asked for every 2 s, at most 15 times, while they are drafted,
// over the real API client and a fake network. Nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { json, serveApi, type Answer } from '../../api/testing/fakeApi';
import { advance } from '../../components/testing/screen';
import { CHOICE_POLL_MS, CHOICE_POLLS, useCheckpointResult } from '../useCheckpointResult';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const MILESTONE = '0b7f6c1e-0000-4000-8000-000000000001';
const SUBMISSION = '0b7f6c1e-0000-4000-8000-0000000000aa';
const SUBMIT = `POST /milestones/${MILESTONE}/submit`;
const POLL = `GET /checkpoints/${SUBMISSION}`;

const receipt = json(202, { submission_id: SUBMISSION, status: 'pending' });
const GRADED = { status: 'graded', passed: true, score: 1, feedback: null, criteria: null };

// Every case runs on Jest's fake clock, moved on by `advance`.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Serves the submit route `submit` and the poll route `polls`, in order. */
function serve(submit: Answer[], polls: Answer[]) {
  return serveApi({ [SUBMIT]: submit, [POLL]: polls });
}

function renderResult(milestoneId: string) {
  return renderHook(({ id, on }: { id: string; on: boolean }) => useCheckpointResult(id, on), {
    initialProps: { id: milestoneId, on: true },
  });
}

/** Submits code the phone passed and lets the POST answer. */
async function submitCode(hook: ReturnType<typeof renderResult>) {
  act(() => {
    hook.result.current.submit('s("bd*4")', true);
  });
  await advance(0);
}

const polls = (requests: { method: string }[]) => requests.filter((r) => r.method === 'GET');

describe('useCheckpointResult: the projects of a level 2 (M11 plan Task 21; decision M21)', () => {
  const CHOOSE = {
    choices: [],
    completed: true,
    level: 1,
    next: 'choose',
    next_slug: null,
    points: 100,
  };
  const CHOICES = [
    { slug: 'strudel-level-2-1', title: 'Drum machine', style: 'techno', brief: 'A kit.' },
    { slug: 'strudel-level-2-2', title: 'Ambient pad', style: 'ambient', brief: 'A drone.' },
  ];
  const drafting = () => json(200, { ...GRADED, level: CHOOSE });
  const offered = () => json(200, { ...GRADED, level: { ...CHOOSE, choices: CHOICES } });

  it('asks every 2 s while the projects are drafted, and shows them once they arrive', async () => {
    const requests = serve([receipt], [drafting(), drafting(), offered()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);
    expect(hook.result.current.level).toStrictEqual(CHOOSE);
    expect(polls(requests)).toHaveLength(1);

    await advance(CHOICE_POLL_MS - 1);
    expect(polls(requests)).toHaveLength(1);
    await advance(1);
    expect(polls(requests)).toHaveLength(2);
    expect(hook.result.current.level?.choices).toStrictEqual([]);
    await advance(CHOICE_POLL_MS);

    expect(hook.result.current.level?.choices).toStrictEqual(CHOICES);
    expect(hook.result.current.choicesLater).toBe(false);
    await advance(60_000);
    expect(polls(requests)).toHaveLength(3);
  });

  it('gives up after 15 asks: the projects are picked later, on the topic screen', async () => {
    const requests = serve([receipt], [drafting()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);
    await advance((CHOICE_POLLS - 1) * CHOICE_POLL_MS);
    expect(hook.result.current.choicesLater).toBe(false);

    await advance(CHOICE_POLL_MS);
    expect(CHOICE_POLLS).toBe(15);
    expect(polls(requests)).toHaveLength(1 + CHOICE_POLLS);
    expect(hook.result.current.choicesLater).toBe(true);
    expect(hook.result.current.level).toStrictEqual(CHOOSE);
    await advance(60_000);
    expect(polls(requests)).toHaveLength(1 + CHOICE_POLLS);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('asks nothing more for a grade that already carries the projects', async () => {
    const requests = serve([receipt], [offered()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);
    await advance(60_000);

    expect(hook.result.current.level?.choices).toStrictEqual(CHOICES);
    expect(polls(requests)).toHaveLength(1);
  });

  it('stops asking off the screen, keeps its count, and stops on a reset', async () => {
    const requests = serve([receipt], [drafting()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);
    await advance(2 * CHOICE_POLL_MS);
    hook.rerender({ id: MILESTONE, on: false });
    await advance(60_000);
    expect(polls(requests)).toHaveLength(3);

    hook.rerender({ id: MILESTONE, on: true });
    await advance((CHOICE_POLLS - 2) * CHOICE_POLL_MS);
    expect(polls(requests)).toHaveLength(1 + CHOICE_POLLS);
    expect(hook.result.current.choicesLater).toBe(true);

    act(() => {
      hook.result.current.reset();
    });
    expect(hook.result.current.choicesLater).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
