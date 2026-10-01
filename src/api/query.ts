/**
 * The server-state cache (TanStack Query) and what the screens' hooks share to read the API
 * through it.
 *
 * - `queryClient` is the app's one cache, given to the root layout's `QueryClientProvider`. It is
 *   cleared when a signed-in user's data must go (`onSignOut`), so the next user never sees it.
 * - Neither queries nor mutations retry: the API client already retries a GET after a network
 *   error or a 503, and a POST is never retried blindly.
 * - `requireApi()` is the API client, or a failure when the app has none (the demo sets), so a
 *   screen that needs the server shows its error state.
 * - `asApiError(error)` is the failure as the one error kind the screens read: an `ApiError`
 *   passes through; anything else (no client, an answer that is not JSON) reads as a server fault.
 */
import { QueryClient } from '@tanstack/react-query';

import { onSignOut } from '../auth/useSession';
import { api, type createApiClient } from './client';
import { ApiError } from './errors';

type ApiClient = ReturnType<typeof createApiClient>;

/** A new cache with the app's defaults: no retries, answers fresh for 30 s. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();

onSignOut(() => {
  queryClient.clear();
});

/** A mutation's status as the screens' hooks report it. */
export const MUTATION_STATUS = {
  idle: 'idle',
  pending: 'loading',
  success: 'ready',
  error: 'error',
} as const;

/** The API client; throws when the app has none (the demo sets). */
export function requireApi(): ApiClient {
  if (api === null) {
    throw new Error('The app has no API client');
  }
  return api;
}

/** `error` as an `ApiError` (see the module comment); `undefined` for no error. */
export function asApiError(error: unknown): ApiError | undefined {
  if (error === null || error === undefined) return undefined;
  return error instanceof ApiError ? error : new ApiError('server', 0);
}
