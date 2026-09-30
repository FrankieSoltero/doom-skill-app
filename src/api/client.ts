/**
 * The app's one API client (rule SS-13 in docs/standards.md: no other file outside `src/auth/`
 * calls `fetch` or imports `openapi-fetch`). `api` is an `openapi-fetch` client typed by the
 * generated `paths` (rule SS-2), so every path, parameter, body and answer is checked against the
 * API's OpenAPI document. It is `null` with the fixture source, which calls no API.
 *
 * Every request passes through `sendWithPolicy`, the client's `fetch`:
 * - Each attempt carries `Authorization: Bearer <token>` (the current access token; none without a
 *   session) and a new `X-Request-ID` (a UUID v4), and is cut off after 15 seconds.
 * - A 401 refreshes the session once and, for a GET, retries once with the new token; a second
 *   401 signs this device out.
 * - A GET that meets a network error or a 503 is retried at most twice, after 1 s and 3 s. Any
 *   other method is never retried here: the attempt outbox owns that.
 * - Any answer outside 2xx rejects with an `ApiError` (src/api/errors.ts) of its kind and status,
 *   as does a network failure or the time limit. The body is never read into it. A request the
 *   caller cancels (its `signal`) rejects with the caller's abort, not an `ApiError`.
 *
 * So `await api.GET(...)` gives `{ data }` for a 2xx (`data` is undefined for a 204), and throws
 * otherwise. The token is never logged and never put in a URL.
 */
import createClient from 'openapi-fetch';

import { supabase } from '../auth/supabase';
import { getAccessToken, signOut } from '../auth/useSession';
import { config } from '../config';
import { logWarning } from '../log';
import { ApiError, errorForStatus } from './errors';
import type { paths } from './schema';

/** Each attempt's time limit. */
const TIMEOUT_MS = 15_000;

/** The waits before the retries of a GET: at most two retries. */
const RETRY_DELAYS_MS = [1000, 3000];

/** What the client needs from the outside, given so the tests can replace each part. */
export type ApiClientDeps = {
  baseUrl: string;
  /** Sends one HTTP request: `fetch` in the app. */
  send: (request: Request) => Promise<Response>;
  /** Waits `ms` milliseconds before a retry. */
  sleep: (ms: number) => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  /** Asks for a new access token; true when there is one. */
  refreshSession: () => Promise<boolean>;
  signOut: () => Promise<void>;
};

/**
 * A new UUID v4, from `crypto.randomUUID` where it exists, else from `getRandomValues`: each
 * request's `X-Request-ID`, and each attempt's `client_attempt_id` (src/feed/outbox.ts).
 */
export function newUuid(): string {
  const random: Partial<Crypto> & Pick<Crypto, 'getRandomValues'> = globalThis.crypto;
  if (random.randomUUID !== undefined) {
    return random.randomUUID();
  }
  const bytes = random.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // the RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/** The request's headers for one attempt: the current token and a new request id. */
async function attemptHeaders(deps: ApiClientDeps, request: Request): Promise<Headers> {
  const headers = new Headers(request.headers);
  const token = await deps.getAccessToken();
  if (token === null) {
    headers.delete('Authorization');
  } else {
    headers.set('Authorization', `Bearer ${token}`);
  }
  headers.set('X-Request-ID', newUuid());
  return headers;
}

/**
 * Sends `request` once, with this attempt's headers, cut off after `TIMEOUT_MS`. A failure to get
 * an answer is an `ApiError` (`timeout` or `offline`), unless the caller cancelled.
 */
async function attempt(deps: ApiClientDeps, request: Request): Promise<Response> {
  const headers = await attemptHeaders(deps, request);
  // Aborted by the time limit or by the caller's cancel, and by nothing else.
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);
  const cancel = () => {
    controller.abort();
  };
  request.signal.addEventListener('abort', cancel);
  if (request.signal.aborted) {
    cancel();
  }
  try {
    return await deps.send(new Request(request, { headers, signal: controller.signal }));
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }
    throw new ApiError(controller.signal.aborted ? 'timeout' : 'offline', 0);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', cancel);
  }
}

function isOffline(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'offline';
}

/** Sends `request`, retrying a GET after a network error or a 503 (see the module comment). */
async function withRetries(deps: ApiClientDeps, request: Request): Promise<Response> {
  const delays = request.method === 'GET' ? RETRY_DELAYS_MS : [];
  for (let retry = 0; ; retry += 1) {
    const delay = delays[retry];
    try {
      const response = await attempt(deps, request);
      if (response.status !== 503 || delay === undefined) {
        return response;
      }
    } catch (error) {
      if (delay === undefined || !isOffline(error)) {
        throw error;
      }
    }
    await deps.sleep(delay);
  }
}

/** The response when it is a 2xx, else its `ApiError`. */
function checked(response: Response): Response {
  if (response.ok) {
    return response;
  }
  throw errorForStatus(response.status);
}

/** The client's `fetch`: the retries, the session refresh and the errors of the module comment. */
async function sendWithPolicy(deps: ApiClientDeps, request: Request): Promise<Response> {
  const response = await withRetries(deps, request);
  if (response.status !== 401) {
    return checked(response);
  }
  const refreshed = await deps.refreshSession();
  if (!refreshed || request.method !== 'GET') {
    return checked(response);
  }
  const again = await withRetries(deps, request);
  if (again.status === 401) {
    await deps.signOut();
  }
  return checked(again);
}

/** An API client over `deps`, typed by the generated `paths`. */
export function createApiClient(deps: ApiClientDeps) {
  return createClient<paths>({
    baseUrl: deps.baseUrl,
    fetch: (request: Request) => sendWithPolicy(deps, request),
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** The class name of a failure, the only part of it that is logged. */
function kindOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * Refreshes the session through Supabase; true when a new session came. A refresh the server
 * refuses makes Supabase remove the session, which signs the user out (`useSession`).
 */
async function refreshWith(client: NonNullable<typeof supabase>): Promise<boolean> {
  try {
    const { data, error } = await client.auth.refreshSession();
    if (error !== null) {
      logWarning('session_refresh_failed', { kind: kindOf(error) });
    }
    return data.session !== null;
  } catch (error) {
    logWarning('session_refresh_failed', { kind: kindOf(error) });
    return false;
  }
}

function makeApi() {
  const client = supabase;
  if (client === null) {
    return null;
  }
  return createApiClient({
    baseUrl: config.apiUrl,
    send: (request) => fetch(request),
    sleep: wait,
    getAccessToken,
    refreshSession: () => refreshWith(client),
    signOut,
  });
}

/** The client, or `null` with the fixture source (see the module comment). */
export const api = makeApi();
