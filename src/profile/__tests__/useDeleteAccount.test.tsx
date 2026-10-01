// Deleting the account (src/profile/useDeleteAccount.ts), over the real API client, a fake network
// and the expo-notifications stand-in (src/profile/__mocks__/notifications.ts). `signOut` runs for
// real (the tests have no Supabase client), so its clearing of the user's data is what is checked.
import { act, renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { json, queryWrapper, serveApi } from '../../api/testing/fakeApi';
import * as session from '../../auth/useSession';
import { useFeedStore } from '../../feed/store';
import * as log from '../../log';
import { useDeleteAccount } from '../useDeleteAccount';
// Registers the reminder's sign-out listener, as the app does when the Profile tab loads.
import '../reminders';

const notifications = jest.mocked(Notifications);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const settle = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });

function renderDelete() {
  const { wrapper } = queryWrapper();
  return renderHook(() => useDeleteAccount(), { wrapper });
}

describe('useDeleteAccount', () => {
  it('sends DELETE /me with the confirmation, then signs out and clears the data', async () => {
    const requests = serveApi({ 'DELETE /me': [new Response(null, { status: 204 })] });
    const signOut = jest.spyOn(session, 'signOut');
    const reset = jest.spyOn(useFeedStore.getState(), 'reset');
    const { result } = renderDelete();
    expect(result.current.status).toBe('idle');

    act(() => {
      result.current.deleteAccount();
    });
    await settle();

    expect(requests).toStrictEqual([
      { method: 'DELETE', path: '/me', query: '', body: { confirm: 'delete' } },
    ]);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('daily-reminder');
    expect(result.current.status).toBe('ready');
  });

  it.each([
    ['a 503', json(503, { detail: 'Service unavailable' })],
    ['a 401', json(401, { detail: 'Not authenticated' })],
    ['no network', new TypeError('Network request failed')],
  ])('stays signed in and reports an error after %s', async (_name, answer) => {
    serveApi({ 'DELETE /me': [answer] });
    const signOut = jest.spyOn(session, 'signOut');
    const warn = jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    const { result } = renderDelete();

    act(() => {
      result.current.deleteAccount();
    });
    await settle();

    expect(result.current.status).toBe('error');
    expect(warn).toHaveBeenCalledWith('account_delete_failed', { kind: 'ApiError' });
    expect(signOut).not.toHaveBeenCalled();
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('is loading while the request runs', async () => {
    serveApi({ 'DELETE /me': [new Promise<Response>(() => undefined)] });
    const { result } = renderDelete();

    act(() => {
      result.current.deleteAccount();
    });
    await settle();

    expect(result.current.status).toBe('loading');
  });
});
