// The profile (src/profile/useProfile.ts), over the real API client and a fake network.
import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../api/errors';
import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import { useProfile } from '../useProfile';

const PROFILE = {
  id: 'user-1',
  display_name: 'Frankie',
  daily_minutes: 10,
  push_time: null,
  timezone: 'America/New_York',
  created_at: '2026-09-28T12:00:00Z',
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const settle = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });

async function renderProfile() {
  const { wrapper } = queryWrapper();
  const rendered = renderHook(() => useProfile(), { wrapper });
  await settle();
  return rendered;
}

describe('useProfile', () => {
  it('is loading, then holds the profile from GET /me', async () => {
    serveApi({ 'GET /me': [json(200, PROFILE)] });
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useProfile(), { wrapper });
    expect(result.current.status).toBe('loading');

    await settle();

    expect(result.current).toMatchObject({ status: 'ready', profile: PROFILE });
  });

  it('sends only the changed fields with PATCH /me, and holds the answer', async () => {
    const changed = { ...PROFILE, daily_minutes: 20, push_time: '20:30:00' };
    const requests = serveApi({
      'GET /me': [json(200, PROFILE)],
      'PATCH /me': [json(200, changed)],
    });
    const { result } = await renderProfile();

    await act(() => result.current.update({ daily_minutes: 20, push_time: '20:30' }));

    expect(requests.find((r) => r.method === 'PATCH')?.body).toStrictEqual({
      daily_minutes: 20,
      push_time: '20:30',
    });
    expect(result.current.profile).toStrictEqual(changed);
  });

  it('rejects a refused change with its ApiError and keeps the profile', async () => {
    serveApi({ 'GET /me': [json(200, PROFILE)], 'PATCH /me': [json(422, {})] });
    const { result } = await renderProfile();

    await expect(
      act(() => result.current.update({ timezone: 'Mars/Olympus' })),
    ).rejects.toBeInstanceOf(ApiError);

    expect(result.current.profile).toStrictEqual(PROFILE);
  });

  it('reports a failed read with its ApiError, and asks again on retry', async () => {
    const requests = serveApi({ 'GET /me': [json(500, {}), json(200, PROFILE)] });
    const { result } = await renderProfile();
    expect(result.current.status).toBe('error');
    expect(result.current.error?.status).toBe(500);

    act(() => {
      result.current.retry();
    });
    await settle();

    expect(requests).toHaveLength(2);
    expect(result.current.status).toBe('ready');
  });
});
