/**
 * UI strings of the Profile tab and of the daily reminder it schedules. Part of `copy`
 * (src/copy/index.ts), which freezes them; read them through `copy`, not from here.
 */

/** The Profile tab (app/(tabs)/profile.tsx), README.md:165-168. */
export const profile = {
  title: 'Profile',
  displayName: 'Display name',
  displayNamePlaceholder: 'Your name',
  /** The daily budget control's caption, README.md:167. */
  dailyMinutes: 'Daily time budget',
  /** A budget option's text and its spoken label. */
  minutes: (n: number) => `${String(n)} min`,
  minutesLabel: (n: number) => `${String(n)} minutes a day`,
  reminder: 'Daily reminder',
  /** The reminder switch's spoken label. */
  reminderSwitch: 'Remind me every day',
  reminderTime: 'Reminder time',
  /** The reminder time field's hint: 24-hour `HH:MM`. */
  reminderTimePlaceholder: '20:30',
  invalidTime: 'Enter a time as HH:MM, for example 20:30.',
  /** The one line shown when the device refuses notifications. */
  remindersDenied:
    'Notifications are off for LearnLoop. Turn them on in Settings to get a reminder.',
  timezone: 'Timezone',
  /** The button that sets the profile's timezone to the device's. */
  useDeviceTimezone: (zone: string) => `Use this device's timezone (${zone})`,
  signOut: 'Sign out',
  loadFailed: "Couldn't load your profile.",
  saveFailed: "Couldn't save your change. Try again.",
} as const;

/** The daily reminder's notification (src/profile/reminders.ts). */
export const reminder = {
  title: 'LearnLoop',
  body: 'Your cards for today are ready.',
} as const;
