/**
 * UI strings of the Profile tab and of the daily reminder it schedules. Part of `copy`
 * (src/copy/index.ts), which freezes them; read them through `copy`, not from here.
 */

/** The Profile tab (app/(tabs)/profile.tsx), README.md:165-168. */
export const profile = {
  title: 'Profile',
  displayName: 'Display name',
  displayNamePlaceholder: 'Your name',
  /** Why a display name is refused: the rule's three local checks (src/profile/nameRules.ts). */
  nameShort: 'At least 3 characters',
  nameLong: 'At most 24 characters',
  nameChars: 'Letters, digits, spaces and _ only',
  /** Why the API refused a display name: 409, then 422. */
  nameTaken: 'That name is taken',
  nameNotAllowed: "That name isn't allowed",
  /** The leaderboard opt-in needs a display name (turned on without one, or the API's 422). */
  nameRequired: 'Add a display name first',
  /** The leaderboard opt-in switch's caption and spoken label, and the note under it. */
  leaderboardSwitch: 'Show me on topic leaderboards',
  leaderboardNote:
    'Your display name is shown on topic leaderboards and next to questions you ask or answer.',
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
    'Notifications are off for DoomSkill. Turn them on in Settings to get a reminder.',
  timezone: 'Timezone',
  /** The button that sets the profile's timezone to the device's. */
  useDeviceTimezone: (zone: string) => `Use this device's timezone (${zone})`,
  /** The row that links to the app's source (M7 open client): its label. */
  sourceCode: 'Source code',
  /** The row's subtitle when the running build carries no tag (a development build). */
  developmentBuild: 'development build',
  signOut: 'Sign out',
  loadFailed: "Couldn't load your profile.",
  saveFailed: "Couldn't save your change. Try again.",
  /** The Delete account action and its confirmation sheet (src/profile/DeleteAccountSheet.tsx). */
  deleteAccount: 'Delete account',
  deleteTitle: 'Delete your account?',
  deleteBody: 'This removes your account and everything you learned. Type delete to confirm.',
  /** The word the person types to confirm, compared without case or surrounding spaces. */
  deleteWord: 'delete',
  /** The confirmation field's spoken label. */
  deleteField: 'Type delete to confirm',
  deleteFailed: 'Could not delete your account. Try again later.',
  cancel: 'Cancel',
  /** The footer's line for the topic catalog's sources and their licences (plan C9, NOTICE). */
  attribution:
    'Topic names from Wikipedia and Stack Overflow (CC BY-SA 4.0), Wikidata (CC0) and the Library of Congress.',
} as const;

/** The daily reminder's notification (src/profile/reminders.ts). */
export const reminder = {
  title: 'DoomSkill',
  body: 'Your cards for today are ready.',
} as const;
