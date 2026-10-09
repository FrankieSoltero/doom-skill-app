// Enrolling in a topic (src/topics/useEnroll.ts), over the real API client and a fake network.
import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useSession } from '../../auth/useSession';
import { activeTopic, loadActiveTopic } from '../../feed/useActiveTopic';
import { useEnroll } from '../useEnroll';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
// The placement calls (src/data): null with the demo sets, set by a test to stand for the API.
const mockData: { placement: object | null } = { placement: null };
jest.mock('../../data', () => ({
  get placement() {
    return mockData.placement;
  },
}));

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
  level: 1,
  last_studied_at: null,
};

beforeEach(async () => {
  mockData.placement = null;
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
  let next: unknown = null;
  await act(async () => {
    next = await result.current.enroll().catch((error: unknown) => {
      thrown = error;
    });
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  return { result, thrown, next };
}

describe('useEnroll', () => {
  it.each([201, 200])(
    "enrolls for 14 days at the profile's daily minutes; a %i makes it the active topic",
    async (status) => {
      const requests = serveApi({
        'GET /me': [json(200, PROFILE)],
        'POST /topics/strudel/enroll': [json(status, ENROLLMENT)],
      });

      const { result, thrown, next } = await enroll('strudel');

      expect(thrown).toBeNull();
      expect(next).toBe('feed');
      expect(requests.find((r) => r.method === 'POST')?.body).toStrictEqual({
        horizon_days: 14,
        daily_minutes: 20,
      });
      expect(result.current.status).toBe('ready');
      expect(activeTopic()).toBe('strudel');
    },
  );

  it('with the API, a 201 leads to the placement quiz and leaves the active topic to it', async () => {
    mockData.placement = {};
    serveApi({
      'GET /me': [json(200, PROFILE)],
      'POST /topics/strudel/enroll': [json(201, ENROLLMENT)],
    });
    const before = activeTopic();

    const { result, next } = await enroll('strudel');

    expect(next).toBe('placement');
    expect(result.current.status).toBe('ready');
    expect(activeTopic()).toBe(before);
  });

  it('with the API, a 200 (enrolled already) opens the feed on the topic', async () => {
    mockData.placement = {};
    serveApi({
      'GET /me': [json(200, PROFILE)],
      'POST /topics/strudel/enroll': [json(200, ENROLLMENT)],
    });

    const { next } = await enroll('strudel');

    expect(next).toBe('feed');
    expect(activeTopic()).toBe('strudel');
  });

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
