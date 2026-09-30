/**
 * The attempt outbox: each answered card of a set the API served waits here, in async storage,
 * until `POST /cards/{id}/attempt` has it. The app's own check has already shown the result and
 * opened the gate; the server's answer updates progress only.
 *
 * - `add(attempt)` gives the attempt a `client_attempt_id` (a UUID v4, so a resent request records
 *   one attempt), cuts exercise code to 5,000 characters (as the server stores it), stores it and
 *   starts a flush. At most 200 attempts are kept: beyond that the oldest is dropped and logged.
 * - `flush()` posts the attempts in order, one at a time. A 2xx removes one; a 404, 409 or 422
 *   also removes it (the API will never take it) and logs the kind. Anything else (offline, a
 *   timeout, a 5xx, a 429, a 401 the client's refresh did not fix) keeps it and those after it,
 *   and tries again after 5 s, 30 s, then every 2 minutes, and whenever `flush()` is called (the
 *   app does on returning to the foreground). A flush already running is joined.
 * - `pending()` is the number of attempts not yet sent; `subscribe` tells when it changes.
 * - `clear()` empties it, storage included (the app does on sign-out).
 *
 * What an earlier run left in storage is sent first, as soon as the outbox is made; an entry that
 * does not fit is dropped. The logs name kinds and counts only, never an answer's content.
 *
 * The app's outbox installs itself as the feed store's sink for answered cards when this module
 * loads; the feed session imports it, so it is in place before any card can be answered.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { api, newUuid } from '../api/client';
import { ApiError } from '../api/errors';
import { onSignOut } from '../auth/useSession';
import { logWarning } from '../log';
import { kindOf, storedQueue, type Attempt, type Queued, type QueueStorage } from './outboxQueue';
import { sendAttemptsTo } from './store';

export type { Attempt } from './outboxQueue';

export type OutboxDeps = {
  /** Sends one attempt; resolves on a 2xx, rejects otherwise (an `ApiError` from the client). */
  post: (attempt: Queued) => Promise<void>;
  storage: QueueStorage;
  /** Runs `run` after `ms`; returns the function that cancels it. */
  schedule: (run: () => void, ms: number) => () => void;
  newId: () => string;
};

export type Outbox = {
  add: (attempt: Attempt) => void;
  flush: () => Promise<void>;
  pending: () => number;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
};

const MAX_CODE_CHARACTERS = 5_000;
/** The waits before each retry; the last repeats. */
const RETRY_MS = [5_000, 30_000, 120_000] as const;
/** The answers after which the API will never take the attempt. */
const REFUSED = new Set([404, 409, 422]);

/** `response` with exercise code cut to 5,000 characters, counted as the server counts them. */
function cut(response: Attempt['response']): Attempt['response'] {
  if (!('code' in response)) return response;
  return { code: Array.from(response.code).slice(0, MAX_CODE_CHARACTERS).join('') };
}

/**
 * Posts `head`: true when it is done with, sent or refused for good (a 404, 409 or 422, logged
 * with its kind); false when it must wait for a retry.
 */
async function sendOne(post: OutboxDeps['post'], head: Queued): Promise<boolean> {
  try {
    await post(head);
    return true;
  } catch (error) {
    if (error instanceof ApiError && REFUSED.has(error.status)) {
      logWarning('attempt_dropped', { kind: error.kind, status: error.status });
      return true;
    }
    logWarning('attempt_send_failed', { kind: kindOf(error) });
    return false;
  }
}

/** An outbox over `deps` (see the module comment). It reads what storage holds at once. */
export function createOutbox(deps: OutboxDeps): Outbox {
  const queue = storedQueue(deps.storage);
  let failures = 0;
  let cancelRetry: (() => void) | null = null;
  let running: Promise<void> | null = null;

  const stopRetry = () => {
    cancelRetry?.();
    cancelRetry = null;
  };
  const retryLater = () => {
    const wait = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)] ?? RETRY_MS[0];
    failures += 1;
    cancelRetry = deps.schedule(() => {
      cancelRetry = null;
      void flush();
    }, wait);
  };
  // `running` is cleared before the pass's promise settles, so a flush asked for after the last
  // attempt was checked starts a new pass rather than joining one that has ended.
  const pass = async (): Promise<void> => {
    try {
      await queue.loaded;
      for (let head = queue.head(); head !== undefined; head = queue.head()) {
        if (!(await sendOne(deps.post, head))) {
          retryLater();
          return;
        }
        failures = 0;
        queue.remove(head);
      }
    } finally {
      running = null;
    }
  };
  const flush = (): Promise<void> => {
    stopRetry();
    running ??= pass();
    return running;
  };
  void flush();

  return {
    add: (attempt) => {
      queue.push({ ...attempt, response: cut(attempt.response), clientAttemptId: deps.newId() });
      void flush();
    },
    flush,
    pending: queue.size,
    clear: () => {
      stopRetry();
      failures = 0;
      queue.clear();
    },
    subscribe: queue.subscribe,
  };
}

type Client = NonNullable<typeof api>;

/** Posts `attempt` through the app's API client, in the API's snake_case body. */
async function post(client: Client, attempt: Queued): Promise<void> {
  await client.POST('/cards/{card_id}/attempt', {
    params: { path: { card_id: attempt.cardId } },
    body: {
      client_attempt_id: attempt.clientAttemptId,
      response: attempt.response,
      duration_ms: attempt.durationMs,
      feed_date: attempt.feedDate,
      set_number: attempt.setNumber,
    },
  });
}

/** With the demo sets there is no API, and nothing to send. */
const INERT: Outbox = {
  add: () => undefined,
  flush: () => Promise.resolve(),
  pending: () => 0,
  clear: () => undefined,
  subscribe: () => () => undefined,
};

/**
 * The app's outbox over the API client and async storage. It flushes when the app returns to the
 * foreground, is cleared when the user signs out, and takes the feed store's answered cards.
 */
function appOutbox(): Outbox {
  const client = api;
  if (client === null) return INERT;
  const outbox = createOutbox({
    post: (attempt) => post(client, attempt),
    storage: AsyncStorage,
    schedule: (run, ms) => {
      const timer = setTimeout(run, ms);
      return () => {
        clearTimeout(timer);
      };
    },
    newId: newUuid,
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void outbox.flush();
  });
  onSignOut(() => {
    outbox.clear();
  });
  sendAttemptsTo(outbox);
  return outbox;
}

export const outbox = appOutbox();
