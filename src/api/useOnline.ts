/**
 * Whether the app can reach the API (offline-topic plan, Global Constraints), read from the API
 * client's outcomes (`onResult`, src/api/online.ts): true until a request fails as `offline` or
 * `timeout`, and true again after any success. Any other failure is an answer from the server and
 * changes nothing. With the fixture source no request is sent, so it stays true. No new dependency:
 * one module flag behind `useSyncExternalStore`.
 */
import { useSyncExternalStore } from 'react';

import { onResult } from './online';

let online = true;
const subscribers = new Set<() => void>();

onResult((ok, kind) => {
  const next = ok || (kind !== 'offline' && kind !== 'timeout' && online);
  if (next === online) return;
  online = next;
  for (const subscriber of subscribers) subscriber();
});

function subscribe(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

function isOnline(): boolean {
  return online;
}

/**
 * Puts the flag back to true and tells the subscribers, for a test that left it false: the flag is
 * shared by every test in a file, as the client is.
 */
export function resetOnline(): void {
  if (online) return;
  online = true;
  for (const subscriber of subscribers) subscriber();
}

/** True unless the last word from the network was an `offline` or `timeout` failure. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, isOnline);
}
