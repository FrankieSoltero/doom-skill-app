// The Profile tab's Delete account action (app/(tabs)/profile.tsx and
// src/profile/DeleteAccountSheet.tsx), over the real API client and a fake network. `signOut` is replaced: its own tests cover what it
// clears, and src/profile/__tests__/useDeleteAccount.test.tsx runs it for real.
import { fireEvent, screen, within } from '@testing-library/react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import * as session from '../../../src/auth/useSession';
import * as log from '../../../src/log';
import { advance, renderScreen } from '../../../src/components/testing/screen';
import { deviceTimezone } from '../../../src/profile/useProfile';
import ProfileScreen from '../profile';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const PROFILE = {
  id: 'user-1',
  display_name: null,
  daily_minutes: 10,
  push_time: null,
  timezone: deviceTimezone(),
  created_at: '2026-09-28T12:00:00Z',
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The Profile tab with the sheet open; the requests the network was sent. */
async function openSheet(deleted: Response | Error = new Response(null, { status: 204 })) {
  const requests = serveApi({ 'GET /me': [json(200, PROFILE)], 'DELETE /me': [deleted] });
  const signOut = jest.spyOn(session, 'signOut').mockResolvedValue();
  await renderScreen(<ProfileScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));
  const sheet = within(screen.getByTestId('delete-account-sheet'));
  const deletes = () => requests.filter((r) => r.method === 'DELETE');
  return { sheet, signOut, deletes };
}

describe('Profile: delete the account', () => {
  it('asks for the typed word in a sheet', async () => {
    const { sheet } = await openSheet();

    expect(sheet.getByRole('header', { name: 'Delete your account?' })).toBeOnTheScreen();
    expect(
      sheet.getByText(
        'This removes your account and everything you learned. Type delete to confirm.',
      ),
    ).toBeOnTheScreen();
    expect(sheet.getByRole('button', { name: 'Delete account' })).toBeDisabled();
  });

  it('deletes only once delete is typed, then signs out', async () => {
    const { sheet, signOut, deletes } = await openSheet();
    const field = sheet.getByLabelText('Type delete to confirm');

    fireEvent.changeText(field, 'delet');
    fireEvent.press(sheet.getByRole('button', { name: 'Delete account' }));
    await advance(0);
    expect(deletes()).toStrictEqual([]);
    fireEvent.changeText(field, ' Delete ');
    expect(sheet.getByRole('button', { name: 'Delete account' })).toBeEnabled();
    fireEvent.press(sheet.getByRole('button', { name: 'Delete account' }));
    await advance(0);

    expect(deletes()).toStrictEqual([
      { method: 'DELETE', path: '/me', query: '', body: { confirm: 'delete' } },
    ]);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows one fixed line and stays signed in when the deletion fails', async () => {
    const { sheet, signOut } = await openSheet(json(503, { detail: 'Service unavailable' }));
    jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);

    fireEvent.changeText(sheet.getByLabelText('Type delete to confirm'), 'delete');
    fireEvent.press(sheet.getByRole('button', { name: 'Delete account' }));
    await advance(0);

    expect(sheet.getByText('Could not delete your account. Try again later.')).toBeOnTheScreen();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('closes on Cancel without deleting, and opens again empty', async () => {
    const { sheet, deletes } = await openSheet();
    fireEvent.changeText(sheet.getByLabelText('Type delete to confirm'), 'delete');

    fireEvent.press(sheet.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('delete-account-sheet')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Delete account' }));

    expect(screen.getByLabelText('Type delete to confirm')).toHaveProp('value', '');
    expect(deletes()).toStrictEqual([]);
  });
});
