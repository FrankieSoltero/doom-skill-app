// Test support: a stand-in for Expo Router's `useFocusEffect`, whose focus the test sets, for
// tests that render a hook or a screen without a navigator. Not app code.
//
// A test that uses it imports it as `mockUseFocusEffect` (a name `jest.mock` may use) and mocks
// `expo-router` with a hook that calls it:
//   import { useFocusEffect as mockUseFocusEffect } from '<path>/testing/focus';
//   jest.mock('expo-router', () => ({
//     useFocusEffect: (effect: () => undefined | (() => void)) => {
//       mockUseFocusEffect(effect);
//     },
//   }));
// The mock calls it only when a component renders, after the imports have run. The test calls
// `setFocused` inside `act`.
import { useEffect, useSyncExternalStore } from 'react';

let focused = true;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Focuses or blurs every screen that uses the stand-in. */
export function setFocused(next: boolean): void {
  focused = next;
  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * Runs `effect` while the screen is focused and its cleanup when it loses focus, as Expo Router's
 * hook does; like it, it runs again when `effect` changes.
 */
export function useFocusEffect(effect: () => undefined | (() => void)): void {
  const isFocused = useSyncExternalStore(subscribe, () => focused);
  useEffect(() => (isFocused ? effect() : undefined), [isFocused, effect]);
}
