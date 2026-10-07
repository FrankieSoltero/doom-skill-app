// The Profile tab (app/(tabs)/profile.tsx), over the real API client, a fake network and the
// expo-notifications stand-in (src/profile/__mocks__/notifications.ts).
import { fireEvent, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import * as session from '../../../src/auth/useSession';
import {
  advance,
  pressRetry,
  renderScreen,
  SCREEN_TOP_INSET,
} from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
import { SOURCE_REPOSITORY } from '../../../src/config';
import * as log from '../../../src/log';
import { deviceTimezone } from '../../../src/profile/useProfile';
import { colors } from '../../../src/theme';
import ProfileScreen from '../profile';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

const FRESH = {
  id: 'user-1',
  display_name: null,
  daily_minutes: 10,
  push_time: null,
  timezone: deviceTimezone(),
  created_at: '2026-09-28T12:00:00Z',
  leaderboard_opt_in: false,
};
const SET_UP = {
  ...FRESH,
  display_name: 'Frankie',
  push_time: '20:30:00',
  leaderboard_opt_in: false,
};
const notifications = jest.mocked(Notifications);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderProfile(profile: object, patched: object[] = []) {
  const requests = serveApi({
    'GET /me': [json(200, profile)],
    'PATCH /me': patched.map((body) => json(200, body)),
  });
  await renderScreen(<ProfileScreen />);
  return () => requests.filter((r) => r.method === 'PATCH').map((r) => r.body);
}

describe('Profile: states', () => {
  it('shows a busy line while the profile loads', async () => {
    serveApi({ 'GET /me': [new Promise<Response>(() => undefined)] });
    await renderScreen(<ProfileScreen />);

    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBeOnTheScreen();
  });

  it('shows a failed load with Retry, which asks again', async () => {
    serveApi({ 'GET /me': [json(500, {}), json(200, FRESH)] });
    await renderScreen(<ProfileScreen />);
    expect(screen.getByText("Couldn't load your profile.")).toBeOnTheScreen();

    await pressRetry();

    expect(screen.getByLabelText('Display name')).toBeOnTheScreen();
  });

  it('shows a fresh profile: no name, 10 minutes, the reminder off, on paper below the inset', async () => {
    await renderProfile(FRESH);

    expect(screen.getByRole('header', { name: 'Profile' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Display name')).toHaveProp('value', '');
    expect(screen.getByRole('radio', { name: '10 minutes a day' })).toBeSelected();
    expect(screen.getByRole('switch', { name: 'Remind me every day' })).toHaveProp('value', false);
    expect(screen.queryByLabelText('Reminder time')).toBeNull();
    expect(screen.getByText(deviceTimezone())).toBeOnTheScreen();
    expect(viewStyleOf(screen.getByTestId('profile-screen'))).toMatchObject({
      paddingTop: SCREEN_TOP_INSET,
      backgroundColor: colors.paper,
    });
  });

  it('shows the source link row, below the reminder and above Sign out', async () => {
    await renderProfile(FRESH);

    expect(screen.getByRole('link', { name: 'Source code' })).toBeOnTheScreen();
    expect(screen.getByText('development build')).toBeOnTheScreen();
  });

  it('shows a set-up profile: its name and its reminder time', async () => {
    await renderProfile(SET_UP);

    expect(screen.getByLabelText('Display name')).toHaveProp('value', 'Frankie');
    expect(screen.getByRole('switch', { name: 'Remind me every day' })).toHaveProp('value', true);
    expect(screen.getByLabelText('Reminder time')).toHaveProp('value', '20:30');
  });
});

describe('Profile: changes', () => {
  it('saves a trimmed name when editing ends, and clears a blank one', async () => {
    const patches = await renderProfile(SET_UP, [SET_UP]);
    const field = screen.getByLabelText('Display name');

    fireEvent.changeText(field, '  Frank ');
    fireEvent(field, 'endEditing');
    await advance(0);
    fireEvent.changeText(field, '   ');
    fireEvent(field, 'endEditing');
    await advance(0);

    expect(patches()).toStrictEqual([{ display_name: 'Frank' }, { display_name: null }]);
  });

  it('saves the daily minutes picked', async () => {
    const patches = await renderProfile(FRESH, [{ ...FRESH, daily_minutes: 30 }]);

    fireEvent.press(screen.getByRole('radio', { name: '30 minutes a day' }));
    await advance(0);

    expect(patches()).toStrictEqual([{ daily_minutes: 30 }]);
    expect(screen.getByRole('radio', { name: '30 minutes a day' })).toBeSelected();
  });

  it("offers the device's timezone when the profile has another", async () => {
    const patches = await renderProfile({ ...FRESH, timezone: 'Pacific/Chatham' }, [FRESH]);

    fireEvent.press(
      screen.getByRole('button', { name: `Use this device's timezone (${deviceTimezone()})` }),
    );
    await advance(0);

    expect(patches()).toStrictEqual([{ timezone: deviceTimezone() }]);
  });

  it('shows one fixed line when a change is refused', async () => {
    serveApi({ 'GET /me': [json(200, FRESH)], 'PATCH /me': [json(422, { detail: 'no' })] });
    await renderScreen(<ProfileScreen />);

    fireEvent.press(screen.getByRole('radio', { name: '60 minutes a day' }));
    await advance(0);

    expect(screen.getByText("Couldn't save your change. Try again.")).toBeOnTheScreen();
  });

  it('opens the source repository on the system browser', async () => {
    const linking = jest.mocked(Linking);
    linking.openURL.mockResolvedValueOnce(true);
    await renderProfile(FRESH);

    fireEvent.press(screen.getByRole('link', { name: 'Source code' }));

    expect(linking.openURL.mock.calls).toStrictEqual([[SOURCE_REPOSITORY]]);
  });

  it('signs out', async () => {
    const signOut = jest.spyOn(session, 'signOut').mockResolvedValue();
    await renderProfile(FRESH);

    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('Profile: the daily reminder', () => {
  it('asks for permission only when turned on, schedules it, then saves its time', async () => {
    const patches = await renderProfile(FRESH, [{ ...FRESH, push_time: '20:30:00' }]);
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();

    fireEvent(screen.getByRole('switch', { name: 'Remind me every day' }), 'valueChange', true);
    await advance(0);

    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(patches()).toStrictEqual([{ push_time: '20:30' }]);
    expect(screen.getByLabelText('Reminder time')).toHaveProp('value', '20:30');
  });

  it('shows one line and stays off when notifications are denied', async () => {
    notifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: Notifications.PermissionStatus.DENIED,
      expires: 'never',
    });
    const patches = await renderProfile(FRESH);

    fireEvent(screen.getByRole('switch', { name: 'Remind me every day' }), 'valueChange', true);
    await advance(0);

    expect(
      screen.getByText(
        'Notifications are off for DoomSkill. Turn them on in Settings to get a reminder.',
      ),
    ).toBeOnTheScreen();
    expect(patches()).toStrictEqual([]);
    expect(screen.getByRole('switch', { name: 'Remind me every day' })).toHaveProp('value', false);
  });

  it('cancels it and clears its time when turned off', async () => {
    const patches = await renderProfile(SET_UP, [{ ...SET_UP, push_time: null }]);

    fireEvent(screen.getByRole('switch', { name: 'Remind me every day' }), 'valueChange', false);
    await advance(0);

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('daily-reminder');
    expect(patches()).toStrictEqual([{ push_time: null }]);
  });

  it('moves it to a new time, and refuses a time that is not HH:MM', async () => {
    const patches = await renderProfile(SET_UP, [{ ...SET_UP, push_time: '07:15:00' }]);
    const field = screen.getByLabelText('Reminder time');

    fireEvent.changeText(field, '7.15');
    fireEvent(field, 'endEditing');
    await advance(0);
    expect(screen.getByText('Enter a time as HH:MM, for example 20:30.')).toBeOnTheScreen();
    fireEvent.changeText(field, '07:15');
    fireEvent(field, 'endEditing');
    await advance(0);

    expect(patches()).toStrictEqual([{ push_time: '07:15' }]);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe('Profile: the display-name rule', () => {
  it('caps the name field at 24 characters', async () => {
    await renderProfile(FRESH);

    expect(screen.getByLabelText('Display name')).toHaveProp('maxLength', 24);
  });

  it.each([
    ['ab', 'At least 3 characters'],
    ['x'.repeat(25), 'At most 24 characters'],
    ['Frank!', 'Letters, digits, spaces and _ only'],
  ])('shows why %j is refused under the field and sends nothing', async (name, line) => {
    const patches = await renderProfile(SET_UP);
    const field = screen.getByLabelText('Display name');

    fireEvent.changeText(field, name);
    fireEvent(field, 'endEditing');
    await advance(0);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(patches()).toStrictEqual([]);
  });

  it.each([
    [409, 'That name is taken'],
    [422, "That name isn't allowed"],
  ])('shows the line for a name the API refuses with %i', async (status, line) => {
    const warn = jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    serveApi({ 'GET /me': [json(200, SET_UP)], 'PATCH /me': [json(status, { detail: 'no' })] });
    await renderScreen(<ProfileScreen />);
    const field = screen.getByLabelText('Display name');

    fireEvent.changeText(field, 'Admin');
    fireEvent(field, 'endEditing');
    await advance(0);

    expect(screen.getByText(line)).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith('profile_save_failed', { kind: 'ApiError' });
  });
});

describe('Profile: the leaderboard opt-in', () => {
  it('shows the switch, off, with its note', async () => {
    await renderProfile(SET_UP);

    const toggle = screen.getByRole('switch', { name: 'Show me on topic leaderboards' });
    expect(toggle).toHaveProp('value', false);
    expect(screen.getByTestId('leaderboard-switch')).toBe(toggle);
    expect(
      screen.getByText(
        'Your display name is shown on topic leaderboards and next to questions you ask or answer.',
      ),
    ).toBeOnTheScreen();
  });

  it('saves the opt-in and shows the saved profile', async () => {
    const patches = await renderProfile(SET_UP, [{ ...SET_UP, leaderboard_opt_in: true }]);

    fireEvent(screen.getByTestId('leaderboard-switch'), 'valueChange', true);
    await advance(0);

    expect(patches()).toStrictEqual([{ leaderboard_opt_in: true }]);
    expect(screen.getByTestId('leaderboard-switch')).toHaveProp('value', true);
  });

  it('saves turning it off', async () => {
    const opted = { ...SET_UP, leaderboard_opt_in: true };
    const patches = await renderProfile(opted, [SET_UP]);

    fireEvent(screen.getByTestId('leaderboard-switch'), 'valueChange', false);
    await advance(0);

    expect(patches()).toStrictEqual([{ leaderboard_opt_in: false }]);
    expect(screen.getByTestId('leaderboard-switch')).toHaveProp('value', false);
  });

  it('asks for a display name first and stays off, without a request', async () => {
    const patches = await renderProfile(FRESH);

    fireEvent(screen.getByTestId('leaderboard-switch'), 'valueChange', true);
    await advance(0);

    expect(screen.getByText('Add a display name first')).toBeOnTheScreen();
    expect(patches()).toStrictEqual([]);
    expect(screen.getByTestId('leaderboard-switch')).toHaveProp('value', false);
  });

  it('asks for a display name when the API refuses the opt-in with 422', async () => {
    jest.spyOn(log, 'logWarning').mockImplementation(() => undefined);
    serveApi({ 'GET /me': [json(200, SET_UP)], 'PATCH /me': [json(422, { detail: 'no' })] });
    await renderScreen(<ProfileScreen />);

    fireEvent(screen.getByTestId('leaderboard-switch'), 'valueChange', true);
    await advance(0);

    expect(screen.getByText('Add a display name first')).toBeOnTheScreen();
    expect(screen.getByTestId('leaderboard-switch')).toHaveProp('value', false);
  });
});
