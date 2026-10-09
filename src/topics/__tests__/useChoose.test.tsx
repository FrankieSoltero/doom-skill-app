// Choosing a level-2 project (src/topics/useChoose.ts; M11 plan Task 21, decision M21), over the
// real API client and a fake network: the post, what it marks stale, and the two errors.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import { useSession } from '../../auth/useSession';
import { useChoose } from '../useChoose';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const SLUG = 'strudel-level-2-2';
const ROUTE = `POST /topics/${SLUG}/choose`;

beforeEach(() => {
  jest.useFakeTimers();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Renders the hook over a network that answers the choice with `answer`. */
function renderChoose(answer: Answer) {
  const requests = serveApi({ [ROUTE]: [answer] });
  const { client, wrapper } = queryWrapper();
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const hook = renderHook(() => useChoose(), { wrapper });
  return { hook, requests, invalidate };
}

/** Chooses `SLUG`; what the promise came to. */
async function choose(hook: ReturnType<typeof renderChoose>['hook']) {
  let outcome: unknown = null;
  let thrown: unknown = null;
  await act(async () => {
    outcome = await hook.result.current.choose(SLUG).catch((error: unknown) => {
      thrown = error;
    });
  });
  return { outcome, thrown };
}

describe('useChoose', () => {
  it('starts idle: not pending, no error', () => {
    const { hook } = renderChoose(json(200, { next: 'building', slug: SLUG }));

    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it('posts the choice, resolves to its outcome and marks the topic and enrollments stale', async () => {
    const { hook, requests, invalidate } = renderChoose(
      json(200, { next: 'building', slug: SLUG }),
    );

    const { outcome, thrown } = await choose(hook);

    expect(thrown).toBeNull();
    expect(outcome).toStrictEqual({ next: 'building', slug: SLUG });
    expect(requests.map((r) => `${r.method} ${r.path}`)).toStrictEqual([ROUTE]);
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toStrictEqual([['topic'], ['enrollments']]);
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.error).toBeNull();
  });

  it('is pending while the choice is in flight', async () => {
    let answer: (response: Response) => void = () => undefined;
    const late = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { hook } = renderChoose(late);
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = hook.result.current.choose(SLUG);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(hook.result.current.pending).toBe(true);

    await act(async () => {
      answer(json(200, { next: 'enrolled', slug: SLUG }));
      await done;
    });
    expect(hook.result.current.pending).toBe(false);
  });

  it('reads a 409 (another variant chosen) as chosenOther and rejects', async () => {
    const { hook, invalidate } = renderChoose(json(409, { detail: 'Variant chosen' }));

    const { thrown } = await choose(hook);

    expect(thrown).toBeInstanceOf(Error);
    expect(hook.result.current.error).toBe('chosenOther');
    expect(hook.result.current.pending).toBe(false);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each<[string, Answer]>([
    ['a 404', json(404, { detail: 'Not found' })],
    ['a 503', json(503, { detail: 'Service unavailable' })],
    ['no network', new TypeError('Network request failed')],
    ['a reply the schema refuses', json(200, { next: 'later', slug: SLUG })],
  ])('reads %s as failed and rejects', async (_, answer) => {
    const { hook } = renderChoose(answer);

    const { thrown } = await choose(hook);

    expect(thrown).toBeInstanceOf(Error);
    expect(hook.result.current.error).toBe('failed');
  });
});
