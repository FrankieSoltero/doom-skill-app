// Stands in for expo-notifications in tests: `apps/mobile/jest.config.js` maps the package name to
// this file. The real package is a native module Jest cannot load. Every function is a `jest.fn`
// the test can script; by default notifications are allowed and every call succeeds. The push
// token functions exist so a test can check that they are never called.

/** The trigger types the app uses, with the package's values. */
export const SchedulableTriggerInputTypes = { CALENDAR: 'calendar', DAILY: 'daily' } as const;

/** The package's permission statuses. */
export const PermissionStatus = {
  GRANTED: 'granted',
  UNDETERMINED: 'undetermined',
  DENIED: 'denied',
} as const;

/** The package's iOS authorization statuses. */
export const IosAuthorizationStatus = {
  NOT_DETERMINED: 0,
  DENIED: 1,
  AUTHORIZED: 2,
  PROVISIONAL: 3,
  EPHEMERAL: 4,
} as const;

const GRANTED = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };

export const getPermissionsAsync = jest.fn(() => Promise.resolve(GRANTED));
export const requestPermissionsAsync = jest.fn(() => Promise.resolve(GRANTED));
export const scheduleNotificationAsync = jest.fn((request: { identifier?: string }) =>
  Promise.resolve(request.identifier ?? 'scheduled-id'),
);
export const cancelScheduledNotificationAsync = jest.fn((_identifier: string) => Promise.resolve());
export const getExpoPushTokenAsync = jest.fn(() => Promise.reject(new Error('not in tests')));
export const getDevicePushTokenAsync = jest.fn(() => Promise.reject(new Error('not in tests')));
