// The server's grade of a checkpoint (src/feed/useCheckpointResult.ts): the submission, then the
// polling, over the real API client and a fake network. Nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { json, serveApi, type Answer } from '../../api/testing/fakeApi';
import { logWarning } from '../../log';
import { useCheckpointResult } from '../useCheckpointResult';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const MILESTONE = '0b7f6c1e-0000-4000-8000-000000000001';
const SUBMISSION = '0b7f6c1e-0000-4000-8000-0000000000aa';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBMIT = `POST /milestones/${MILESTONE}/submit`;
const POLL = `GET /checkpoints/${SUBMISSION}`;

const receipt = json(202, { submission_id: SUBMISSION, status: 'pending' });
const PENDING = { status: 'pending', passed: null, score: null, feedback: null, criteria: null };
const GRADED = {
  status: 'graded',
  passed: true,
  score: 0.625,
  feedback: 'Solid groove.',
  criteria: [{ name: 'rhythm', score: 0.75, justification: 'Steady kick.' }],
};
const pending = () => json(200, PENDING);
const graded = () => json(200, GRADED);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.mocked(logWarning).mockClear();
});

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** Serves the submit route `submit` and the poll route `polls`, in order. */
function serve(submit: Answer[], polls: Answer[] = [pending()]) {
  return serveApi({ [SUBMIT]: submit, [POLL]: polls });
}

function renderResult(milestoneId: string | undefined, active = true) {
  return renderHook(
    ({ id, on }: { id: string | undefined; on: boolean }) => useCheckpointResult(id, on),
    { initialProps: { id: milestoneId, on: active } },
  );
}

/** Submits `code` with the on-phone result `passed` and lets the POST answer. */
async function submitCode(
  hook: ReturnType<typeof renderResult>,
  code = 's("bd*4")',
  passed = true,
) {
  act(() => {
    hook.result.current.submit(code, passed);
  });
  await advance(0);
}

const polls = (requests: { method: string }[]) => requests.filter((r) => r.method === 'GET');

describe('useCheckpointResult: the submit', () => {
  it('posts nothing for a card without an id (the demo sets)', async () => {
    const requests = serve([receipt]);
    const hook = renderResult(undefined);
    await submitCode(hook);
    await advance(10_000);

    expect(requests).toHaveLength(0);
    expect(hook.result.current.result).toStrictEqual({ status: 'none' });
  });

  it('posts the code with a new client id and the on-phone result, then shows pending', async () => {
    const requests = serve([receipt]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook, 's("bd*4")', false);
    await submitCode(hook, 's("hh*8")', true);

    const bodies = requests.map((r) => r.body as Record<string, unknown>);
    expect(bodies).toStrictEqual([
      {
        client_submission_id: expect.stringMatching(UUID_V4) as unknown,
        code: 's("bd*4")',
        local_passed: false,
      },
      {
        client_submission_id: expect.stringMatching(UUID_V4) as unknown,
        code: 's("hh*8")',
        local_passed: true,
      },
    ]);
    expect(bodies[0]?.client_submission_id).not.toBe(bodies[1]?.client_submission_id);
    expect(hook.result.current.result).toStrictEqual({ status: 'pending' });
  });

  it('sends at most 5,000 characters of code, as the server stores them', async () => {
    const requests = serve([receipt]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook, 'x'.repeat(5001));

    expect((requests[0]?.body as { code: string }).code).toHaveLength(5000);
  });
});

describe('useCheckpointResult: the polling', () => {
  it('asks every 3 s while pending and stops once graded', async () => {
    const requests = serve([receipt], [pending(), graded()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(2999);
    expect(polls(requests)).toHaveLength(0);

    await advance(1);
    expect(polls(requests)).toHaveLength(1);
    expect(hook.result.current.result).toStrictEqual({ status: 'pending' });
    await advance(3000);

    expect(hook.result.current.result).toStrictEqual({ status: 'graded', grade: GRADED });
    await advance(60_000);
    expect(polls(requests)).toHaveLength(2);
  });

  it('reads a failed grade as unavailable and stops', async () => {
    const requests = serve([receipt], [json(200, { ...PENDING, status: 'failed' })]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);

    expect(hook.result.current.result).toStrictEqual({ status: 'unavailable' });
    await advance(60_000);
    expect(polls(requests)).toHaveLength(1);
  });
});

describe('useCheckpointResult: failures', () => {
  it.each([
    ['429', json(429, { detail: 'Too many submissions' })],
    ['422', json(422, { detail: [{ msg: 'raw server text' }] })],
    ['503', json(503, { detail: 'Service unavailable' })],
    ['offline', new TypeError('Network request failed')],
    ['a receipt marked failed', json(200, { submission_id: SUBMISSION, status: 'failed' })],
  ])('shows unavailable and asks nothing more when the submit answers %s', async (_, answer) => {
    const requests = serve([answer]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(10_000);

    expect(hook.result.current.result).toStrictEqual({ status: 'unavailable' });
    expect(polls(requests)).toHaveLength(0);
  });

  it('never sends a submit again on its own after a failure', async () => {
    const requests = serve([json(503, { detail: 'Service unavailable' }), receipt]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(180_000);

    expect(requests).toHaveLength(1);
  });

  it('stops at once on a 429 from the poll: no timer retries it', async () => {
    const requests = serve([receipt], [json(429, { detail: 'Too many requests' })]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);
    expect(hook.result.current.result).toStrictEqual({ status: 'unavailable' });
    await advance(30_000);

    expect(polls(requests)).toHaveLength(1);
  });
});

describe('useCheckpointResult: when it stops', () => {
  it('gives up after 2 minutes of pending, and asks nothing after', async () => {
    const requests = serve([receipt], [pending()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(117_000);
    expect(hook.result.current.result).toStrictEqual({ status: 'pending' });

    await advance(3000);
    expect(hook.result.current.result).toStrictEqual({ status: 'unavailable' });
    const asked = polls(requests).length;
    await advance(60_000);

    expect(polls(requests)).toHaveLength(asked);
    expect(asked).toBeLessThanOrEqual(40);
  });

  it('keeps asking after a poll that met the network, until the limit', async () => {
    // The client asks a GET three times (two retries) before the poll counts as failed.
    const offline = () => new TypeError('Network request failed');
    const requests = serve([receipt], [offline(), offline(), offline(), graded()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);
    expect(hook.result.current.result).toStrictEqual({ status: 'pending' });

    await advance(3000);
    expect(hook.result.current.result).toStrictEqual({ status: 'graded', grade: GRADED });
    expect(polls(requests)).toHaveLength(4);
  });

  it('shows unavailable at once when the poll is refused for good (a 404)', async () => {
    serve([receipt], [json(404, { detail: 'Not found' })]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    await advance(3000);

    expect(hook.result.current.result).toStrictEqual({ status: 'unavailable' });
  });

  it('stops asking while the card is off the screen and asks again when it returns', async () => {
    const requests = serve([receipt], [pending(), graded()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    hook.rerender({ id: MILESTONE, on: false });
    await advance(30_000);
    expect(polls(requests)).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);

    hook.rerender({ id: MILESTONE, on: true });
    await advance(6000);
    expect(hook.result.current.result).toStrictEqual({ status: 'graded', grade: GRADED });
  });
});

describe('useCheckpointResult: unmount and reset', () => {
  it('leaves no timer and asks nothing once unmounted', async () => {
    const requests = serve([receipt], [pending()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    hook.unmount();
    await advance(0);

    expect(jest.getTimerCount()).toBe(0);
    await advance(30_000);
    expect(polls(requests)).toHaveLength(0);
  });

  it('drops a submit answer that arrives after unmount', async () => {
    let answer: (response: Response) => void = () => undefined;
    const late = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const requests = serve([late], [pending()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    hook.unmount();
    answer(json(202, { submission_id: SUBMISSION, status: 'pending' }));
    await advance(30_000);

    expect(polls(requests)).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reset clears the result and stops asking', async () => {
    const requests = serve([receipt], [pending()]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);
    act(() => {
      hook.result.current.reset();
    });
    await advance(30_000);

    expect(hook.result.current.result).toStrictEqual({ status: 'none' });
    expect(polls(requests)).toHaveLength(0);
  });

  it('never keeps the server text of a refusal', async () => {
    serve([json(422, { detail: 'raw server text' })]);
    const hook = renderResult(MILESTONE);
    await submitCode(hook);

    expect(hook.result.current.result).toStrictEqual({ status: 'unavailable' });
    expect(JSON.stringify(hook.result.current.result)).not.toContain('raw server text');
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['checkpoint_submit_failed', { kind: 'invalid' }],
    ]);
  });
});
