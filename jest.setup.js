// Runs after the test framework is installed in each test file (`setupFilesAfterEnv`), because
// Reanimated's `setUpTests` extends `expect`. Jest provides the `jest` global here, as in tests.
/* global jest */

// react-native-worklets 0.10: the library's documented Jest mock, in the form its docs give for a
// JavaScript setup file (docs.swmansion.com/react-native-worklets/docs/guides/testing). Worklets
// run as plain functions on the JS thread, and `scheduleOnRN` calls back in a microtask.
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

// react-native-reanimated 4: the documented Jest setup
// (docs.swmansion.com/react-native-reanimated/docs/guides/testing). Adds `toHaveAnimatedStyle`,
// and animations advance with Jest's fake timers.
require('react-native-reanimated').setUpTests();
