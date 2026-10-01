// The Profile tab (app/(tabs)/profile.tsx), over the real API client, a fake network and the
// expo-notifications stand-in (src/profile/__mocks__/notifications.ts).
import { fireEvent, screen } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import { json, serveApi } from '../../../src/api/testing/fakeApi';
import * as session from '../../../src/auth/useSession';
import {
  advance,
  pressRetry,
  renderScreen,
  SCREEN_TOP_INSET,
} from '../../../src/components/testing/screen';
import { viewStyleOf } from '../../../src/components/testing/styles';
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
};
const SET_UP = { ...FRESH, display_name: 'Frankie', push_time: '20:30:00' };
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
        'Notifications are off for LearnLoop. Turn them on in Settings to get a reminder.',
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
