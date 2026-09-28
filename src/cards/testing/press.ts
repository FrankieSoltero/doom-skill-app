/**
 * Test support: hold a `Pressable` down and let go, as a finger would, so a test can read its
 * pressed style. `fireEvent(button, 'pressIn')` does not reach a `Pressable`'s own pressed state
 * (see docs/mistakes-and-fixes.md); the responder events do. It lives outside `__tests__/` because
 * Jest runs every file there as a suite.
 */
import { act, fireEvent } from '@testing-library/react-native';

import type { Element } from '../../components/testing/styles';

/** A touch event with the fields Pressability reads. */
function touch() {
  const point = { identifier: 0, locationX: 0, locationY: 0, pageX: 0, pageY: 0, target: 0 };
  return {
    persist: () => undefined,
    currentTarget: { measure: () => undefined },
    nativeEvent: { ...point, timestamp: Date.now(), touches: [], changedTouches: [point] },
  };
}

/** Puts a finger down on `button`. */
export function holdDown(button: Element): void {
  fireEvent(button, 'responderGrant', touch());
}

/**
 * Lifts the finger from `button`. Needs fake timers: Pressability holds its press-out until the
 * press has lasted 130 ms.
 */
export function letGo(button: Element): void {
  fireEvent(button, 'responderRelease', touch());
  act(() => {
    jest.runOnlyPendingTimers();
  });
}
