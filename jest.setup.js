// Runs after the test framework is installed in each test file (`setupFilesAfterEnv`), because
// Reanimated's `setUpTests` extends `expect`. Jest provides the `jest` global here, as in tests.
/* global jest, afterEach */

// react-native-worklets 0.10: the library's documented Jest mock, in the form its docs give for a
// JavaScript setup file (docs.swmansion.com/react-native-worklets/docs/guides/testing). Worklets
// run as plain functions on the JS thread, and `scheduleOnRN` calls back in a microtask.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

// react-native-reanimated 4: the documented Jest setup
// (docs.swmansion.com/react-native-reanimated/docs/guides/testing). Adds `toHaveAnimatedStyle`,
// and animations advance with Jest's fake timers.
require('react-native-reanimated').setUpTests();

// The online flag of src/api/useOnline.ts is shared by every test in a file, as the API client is:
// a test whose request fails as offline would leave the next one offline. Put it back after each
// test. Required here, after the test, so the file's own mocks apply; a file that mocks the module
// has no `resetOnline` to call.
afterEach(() => {
  const online = require('./src/api/useOnline');
  if (typeof online.resetOnline === 'function') online.resetOnline();
});
