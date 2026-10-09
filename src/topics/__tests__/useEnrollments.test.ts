// The learner's enrollments (src/topics/useEnrollments.ts), over the real API client and a fake
// network: the list in server order, a reply with no body, the cache key and the status map.
import { act, renderHook } from '@testing-library/react-native';

import { json, queryWrapper, serveApi, type Answer } from '../../api/testing/fakeApi';
import { useSession } from '../../auth/useSession';
import { ENROLLMENTS_KEY } from '../useChoose';
import { enrollmentStatuses, useEnrollments, type Enrollment } from '../useEnrollments';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const ROUTE = 'GET /me/enrollments';

const enrollment = (slug: string, status: Enrollment['status']): Enrollment => ({
  topic_slug: slug,
  topic_title: slug,
  status,
  daily_minutes: 15,
  horizon_days: 14,
  progress: 0,
  started_at: '2026-09-30T12:00:00Z',
  level: 1,
  last_studied_at: null,
});

const A = enrollment('strudel', 'completed');
const B = { ...enrollment('sql', 'active'), level: 2, last_studied_at: '2026-10-08T09:00:00Z' };

beforeEach(() => {
  jest.useFakeTimers();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function advance() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

/** Renders the hook over a network that answers the enrollments with `answers`, in turn. */
async function renderEnrollments(...answers: Answer[]) {
  const requests = serveApi({ [ROUTE]: answers });
  const { client, wrapper } = queryWrapper();
  const hook = renderHook(() => useEnrollments(), { wrapper });
  await advance();
  return { hook, requests, client };
}

describe('useEnrollments', () => {
  it('reads the enrollments, in the server’s order', async () => {
    const { hook, requests } = await renderEnrollments(json(200, { enrollments: [A, B] }));

    expect(requests.map((r) => r.path)).toStrictEqual(['/me/enrollments']);
    expect(hook.result.current.data).toStrictEqual([A, B]);
  });

  it('errors when the reply has no body', async () => {
    const empty = new Response(null, { status: 200, headers: { 'Content-Length': '0' } });
    const { hook } = await renderEnrollments(empty);

    expect(hook.result.current.isError).toBe(true);
    expect(hook.result.current.error?.message).toBe('The enrollments request gave no body');
  });

  it('is cached under ENROLLMENTS_KEY, so marking it stale reads it again', async () => {
    const { hook, requests, client } = await renderEnrollments(
      json(200, { enrollments: [A] }),
      json(200, { enrollments: [A, B] }),
    );
    expect(client.getQueryData(ENROLLMENTS_KEY)).toStrictEqual([A]);

    await act(async () => {
      await client.invalidateQueries({ queryKey: ENROLLMENTS_KEY });
    });
    await advance();

    expect(requests).toHaveLength(2);
    expect(hook.result.current.data).toStrictEqual([A, B]);
  });
});

describe('enrollmentStatuses', () => {
  it('maps each topic slug to its enrollment’s status', () => {
    const statuses = enrollmentStatuses([enrollment('x', 'completed'), enrollment('y', 'active')]);

    expect(statuses).toStrictEqual(
      new Map([
        ['x', 'completed'],
        ['y', 'active'],
      ]),
    );
  });

  it('is empty for no enrollments', () => {
    expect(enrollmentStatuses([]).size).toBe(0);
  });
});
