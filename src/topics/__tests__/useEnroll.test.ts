// Enrolling in a topic (src/topics/useEnroll.ts), over the real API client and a fake network.
import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useSession } from '../../auth/useSession';
import { activeTopic, loadActiveTopic } from '../../feed/useActiveTopic';
import { useEnroll } from '../useEnroll';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const PROFILE = {
  id: 'user-1',
  display_name: null,
  daily_minutes: 20,
  push_time: null,
  timezone: 'Europe/Madrid',
  created_at: '2026-09-28T12:00:00Z',
};
const ENROLLMENT = {
  topic_slug: 'strudel',
  topic_title: 'Strudel',
  status: 'active',
  daily_minutes: 20,
  horizon_days: 14,
  progress: 0,
  started_at: '2026-09-30T12:00:00Z',
};

beforeEach(async () => {
  jest.useFakeTimers();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
  await loadActiveTopic();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function enroll(slug: string) {
  const { wrapper } = queryWrapper();
  const { result } = renderHook(() => useEnroll(slug), { wrapper });
  let thrown: unknown = null;
  await act(async () => {
    await result.current.enroll().catch((error: unknown) => {
      thrown = error;
    });
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  return { result, thrown };
}

describe('useEnroll', () => {
  it.each([201, 200])(
    "enrolls for 14 days at the profile's daily minutes; a %i makes it the active topic",
    async (status) => {
      const requests = serveApi({
        'GET /me': [json(200, PROFILE)],
        'POST /topics/strudel/enroll': [json(status, ENROLLMENT)],
      });

      const { result, thrown } = await enroll('strudel');

      expect(thrown).toBeNull();
      expect(requests.find((r) => r.method === 'POST')?.body).toStrictEqual({
        horizon_days: 14,
        daily_minutes: 20,
      });
      expect(result.current.status).toBe('ready');
      expect(activeTopic()).toBe('strudel');
    },
  );

  it('enrolls at 10 minutes a day when the profile cannot be read', async () => {
    const requests = serveApi({
      'GET /me': [json(500, {})],
      'POST /topics/rust/enroll': [json(201, { ...ENROLLMENT, topic_slug: 'rust' })],
    });

    await enroll('rust');

    expect(requests.find((r) => r.method === 'POST')?.body).toStrictEqual({
      horizon_days: 14,
      daily_minutes: 10,
    });
  });

  it('rejects a refused enrollment with its ApiError and keeps the active topic', async () => {
    serveApi({
      'GET /me': [json(200, PROFILE)],
      'POST /topics/sql/enroll': [json(409, { detail: 'not ready' })],
    });
    const before = activeTopic();

    const { result, thrown } = await enroll('sql');

    expect(thrown).toBeInstanceOf(ApiError);
    expect(result.current.status).toBe('error');
    expect(result.current.error?.kind).toBe('conflict');
    expect(activeTopic()).toBe(before);
  });
});
