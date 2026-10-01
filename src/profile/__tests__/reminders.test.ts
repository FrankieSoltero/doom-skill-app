// The daily reminder (src/profile/reminders.ts), over the expo-notifications stand-in
// (src/profile/__mocks__/notifications.ts).
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { signOut } from '../../auth/useSession';
import { logWarning } from '../../log';
import { cancelDailyReminder, scheduleDailyReminder } from '../reminders';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const ID = 'daily-reminder';
type Permission = Notifications.NotificationPermissionsStatus;
/** A permission answer; `iosStatus` adds the iOS part, with only the status the code reads. */
const permission = (
  granted: boolean,
  canAskAgain = true,
  iosStatus?: Notifications.IosAuthorizationStatus,
): Permission => ({
  granted,
  canAskAgain,
  expires: 'never',
  status: granted
    ? Notifications.PermissionStatus.GRANTED
    : Notifications.PermissionStatus.UNDETERMINED,
  ...(iosStatus === undefined
    ? {}
    : { ios: { status: iosStatus } as NonNullable<Permission['ios']> }),
});
const mocked = jest.mocked(Notifications);

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('scheduleDailyReminder', () => {
  it('asks for permission when it has none, then repeats a calendar trigger daily (iOS)', async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce(permission(false));

    await expect(scheduleDailyReminder('20:30')).resolves.toBe('scheduled');

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(ID);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: ID,
      content: { title: 'DoomSkill', body: 'Your cards for today are ready.' },
      trigger: { type: 'calendar', hour: 20, minute: 30, repeats: true },
    });
  });

  it('uses the daily trigger on Android, which has no calendar trigger', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    await scheduleDailyReminder('07:05');

    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: { type: 'daily', hour: 7, minute: 5 } }),
    );
  });

  it('does not ask again when permission is already granted, or provisional on iOS', async () => {
    await scheduleDailyReminder('08:00');
    mocked.getPermissionsAsync.mockResolvedValueOnce(
      permission(false, true, Notifications.IosAuthorizationStatus.PROVISIONAL),
    );
    await scheduleDailyReminder('08:00');

    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['the person refuses', permission(false), permission(false)],
    ['the device will not ask again', permission(false, false), null],
  ])('reports denied and schedules nothing when %s', async (_case, current, asked) => {
    mocked.getPermissionsAsync.mockResolvedValueOnce(current);
    if (asked !== null) mocked.requestPermissionsAsync.mockResolvedValueOnce(asked);

    await expect(scheduleDailyReminder('20:30')).resolves.toBe('denied');

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(asked === null ? 0 : 1);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it.each(['24:00', '8:30', '20:60', 'soon'])('refuses the time %p', async (time) => {
    await expect(scheduleDailyReminder(time)).rejects.toThrow('HH:MM');
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('never asks for a push token', async () => {
    await scheduleDailyReminder('20:30');
    await cancelDailyReminder();

    expect(mocked.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mocked.getDevicePushTokenAsync).not.toHaveBeenCalled();
  });
});

describe('cancelDailyReminder', () => {
  it('cancels the reminder', async () => {
    await cancelDailyReminder();

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(ID);
  });

  it("is cancelled when a user's data must go, and a failure is logged", async () => {
    mocked.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('native'));

    await signOut();
    await Promise.resolve();

    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith(ID);
    expect(logWarning).toHaveBeenCalledWith('reminder_cancel_failed', { kind: 'Error' });
  });
});
