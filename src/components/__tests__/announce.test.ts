import { AccessibilityInfo, Platform } from 'react-native';

import { announce } from '../announce';

// React Native's Jest preset already makes `announceForAccessibility` a `jest.fn`
// (@react-native/jest-preset/jest/mocks/AccessibilityInfo.js), so the tests drive that mock and
// clear it themselves.
const announceForAccessibility = jest.mocked(AccessibilityInfo.announceForAccessibility);

beforeEach(() => {
  announceForAccessibility.mockClear();
});

// Puts back a replaced `Platform.OS`, even after a failed test.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('announce', () => {
  it('asks VoiceOver to read the message on iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    announce('Nothing to learn yet.');

    expect(announceForAccessibility.mock.calls).toStrictEqual([['Nothing to learn yet.']]);
  });

  it('leaves Android to the live region around the message', () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    announce('Nothing to learn yet.');

    expect(announceForAccessibility).not.toHaveBeenCalled();
  });
});
