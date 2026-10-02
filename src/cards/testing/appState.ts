/**
 * Test support: tells the app state listeners the hooks under test added that the app changed
 * state. React Native's Jest preset makes `AppState.addEventListener` a `jest.fn`, so the listeners
 * are read from its calls; clear it in `beforeEach` with
 * `jest.mocked(AppState).addEventListener.mockClear()`. It lives outside `__tests__/` because Jest
 * runs every file there as a suite.
 */
import { act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

/** The preset's `AppState.currentState`: a `jest.fn`, which no hook reads as `background`. */
const PRESET_STATE = AppState.currentState;

/** Makes `AppState.currentState` read `state`, as a device reports it to a hook that mounts now. */
export function appIsAlready(state: AppStateStatus): void {
  AppState.currentState = state;
}

/** Puts the preset's `AppState.currentState` back; call it in `afterEach` after `appIsAlready`. */
export function restoreAppState(): void {
  AppState.currentState = PRESET_STATE;
}

/** Tells every app state listener added since the last clear that the app is now `state`. */
export function appBecomes(state: AppStateStatus): void {
  const listeners = jest.mocked(AppState).addEventListener.mock.calls.map((call) => call[1]);
  expect(listeners.length).toBeGreaterThan(0);
  act(() => {
    listeners.forEach((listener) => {
      listener(state);
    });
  });
}
