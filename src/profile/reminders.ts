/**
 * The daily reminder: one local notification a day at the time the learner chose, scheduled on
 * this device through expo-notifications. Nothing is sent to a server, and no push token is ever
 * asked for.
 *
 * - `scheduleDailyReminder('HH:MM')` asks for permission only when the app has none and the
 *   device may still ask, so the prompt shows only when the learner turns the reminder on. A
 *   permission refused (now or before) gives `'denied'` and schedules nothing. Otherwise it
 *   replaces the reminder with one repeating daily at that local time: a calendar trigger with
 *   `repeats` on iOS; Android has no calendar trigger, so it gets the daily trigger.
 * - `cancelDailyReminder()` removes it. It also runs when a signed-in user's data must go
 *   (`onSignOut`), so the next user of the device gets no reminder of theirs.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { onSignOut } from '../auth/useSession';
import { copy } from '../copy';
import { logWarning } from '../log';

/** The reminder's fixed identifier, so a new one replaces the old. */
const REMINDER_ID = 'daily-reminder';

/** `HH:MM` on a 24-hour clock, as the API's `push_time` takes it. */
const HH_MM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/** True for a time the reminder takes: `HH:MM` on a 24-hour clock. */
export function isReminderTime(text: string): boolean {
  return HH_MM.test(text);
}

function kindOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** True when the app may show notifications: granted, or provisional on iOS. */
function allowed(permission: Notifications.NotificationPermissionsStatus): boolean {
  return (
    permission.granted ||
    permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/** Whether notifications may be shown, asking the person only when the device still may. */
async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (allowed(current)) return true;
  if (!current.canAskAgain) return false;
  return allowed(await Notifications.requestPermissionsAsync());
}

/** The trigger for every day at `hour`:`minute`, local time (see the module comment). */
function dailyTrigger(hour: number, minute: number): Notifications.NotificationTriggerInput {
  return Platform.OS === 'ios'
    ? { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, repeats: true }
    : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute };
}

/** Schedules the daily reminder at `time` (`HH:MM`); see the module comment. */
export async function scheduleDailyReminder(time: string): Promise<'scheduled' | 'denied'> {
  const match = HH_MM.exec(time);
  if (match === null) throw new Error('A reminder time is HH:MM on a 24-hour clock');
  if (!(await ensurePermission())) return 'denied';
  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { title: copy.reminder.title, body: copy.reminder.body },
    trigger: dailyTrigger(Number(match[1]), Number(match[2])),
  });
  return 'scheduled';
}

/** Removes the daily reminder, if there is one. */
export async function cancelDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
}

onSignOut(() => {
  cancelDailyReminder().catch((error: unknown) => {
    logWarning('reminder_cancel_failed', { kind: kindOf(error) });
  });
});
