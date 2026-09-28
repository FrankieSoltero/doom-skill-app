// Test support: rendering `useFeedSession` and driving it inside `act`, shared by the session
// tests. Not app code.
import { act, renderHook } from '@testing-library/react-native';

import type { Card, CardSource } from '../../data';
import { useFeedSession } from '../useFeedSession';

// Captured when this module loads, before any test installs fake timers, so `flush` works under
// either kind of timer.
const realSetImmediate = setImmediate;

/** Lets every pending promise settle, inside `act`. */
export async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      realSetImmediate(resolve);
    });
  });
}

/** Renders the session over `source` and lets its first load settle. */
export async function renderSession(source: CardSource, canRender?: (card: Card) => boolean) {
  const view = renderHook(() => useFeedSession(source, canRender));
  await flush();
  return view;
}

/** Calls `action` with `args` inside `act`. */
export function step<Args extends unknown[]>(
  action: (...args: Args) => unknown,
  ...args: Args
): void {
  act(() => {
    action(...args);
  });
}
