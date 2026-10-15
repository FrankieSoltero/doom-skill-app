/**
 * The API client's outcomes (offline-topic plan, Global Constraints): the client
 * (src/api/client.ts) reports each request's outcome here, and `useOnline` (src/api/useOnline.ts)
 * listens. `ok` is true for a 2xx; a failure gives the `ApiError`'s kind, or none for a caller's
 * cancel. No request data goes with it.
 *
 * Its own module, with no import that runs code, so the test setup (jest.setup.js) can reach
 * `useOnline` without loading the client and the session behind it.
 */
import type { ApiError } from './errors';

/** Told after each request's outcome (module comment). */
type ResultListener = (ok: boolean, kind?: ApiError['kind']) => void;

const listeners = new Set<ResultListener>();

/** Tells `listener` each request's outcome from now on; the function returned stops it. */
export function onResult(listener: ResultListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tells every listener one request's outcome: the client's only call here. */
export function reportResult(...outcome: Parameters<ResultListener>): void {
  for (const listener of listeners) listener(...outcome);
}
