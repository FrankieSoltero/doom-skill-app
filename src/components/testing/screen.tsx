/**
 * Renders a screen as the app does, for the screen tests: under a safe area with the reference
 * device's metrics and a fresh server-state cache. It lives outside `__tests__/` because Jest runs
 * every file there as a suite. Tests that use it mock `react-native-safe-area-context` with the
 * package's Jest mock, and `src/api/client` as `src/api/testing/fakeApi.tsx` describes.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryWrapper } from '../../api/testing/fakeApi';

/** The reference device's top inset. */
export const SCREEN_TOP_INSET = 47;

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: SCREEN_TOP_INSET, right: 0, bottom: 34, left: 0 },
};

/** Renders `element` and lets its first requests answer. Returns the cache it renders with. */
export async function renderScreen(element: ReactElement) {
  const { client, wrapper: Cache } = queryWrapper();
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Cache>{element}</Cache>
    </SafeAreaProvider>,
  );
  await advance(0);
  return client;
}

/** Moves Jest's fake clock on by `ms` inside `act`, letting what it starts settle. */
export async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/** Presses the screen's Retry button and lets the request it makes answer. */
export async function pressRetry(): Promise<void> {
  fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
  await advance(0);
}
