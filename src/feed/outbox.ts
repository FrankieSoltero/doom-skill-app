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
 * - The points each reply carries settle the card's provisional value in the feed store
 *   (`settle`, offline-topic plan Task 7), and add to its `pointsEarned`, which the Summary card
 *   shows for the set, unless the card is not in the current set (an earlier set's: its points
 *   belong to that set, and only the regrade check runs). An attempt refused, dropped at the cap
 *   or dropped with its user settles at 0. A replay's reply echoes the points its attempt first
 *   paid, and settles the same way. When the reply's `correct` differs from the app's own grade,
 *   `attempt_regraded` is logged with the card's kind only: the server's grade counts, and the
 *   learner is not told.
 *
 * It holds one user's attempts: the signed-in user's, under a storage key with their id, and is
 * inert (it keeps, stores and sends nothing) while no user is signed in or the session is still
 * being read. When the signed-in user changes (a sign-out, a stored session refused at launch,
 * another user signing in), the queue in memory and its retry are dropped, and every stored queue
 * but the new user's is removed, the earlier version's shared key included: no attempt is ever
 * sent under another user's account.
 *
 * What an earlier run left in storage for the user is sent first, as soon as the user is known; an
 * entry that does not fit is dropped. The logs name kinds and counts only, never an answer's
 * content.
 *
 * The app's outbox installs itself as the feed store's sink for answered cards when this module
 * loads; the feed session imports it, so it is in place before any card can be answered.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { api, newUuid } from '../api/client';
import { ApiError } from '../api/errors';
import { useSession } from '../auth/useSession';
import { logWarning } from '../log';
import { handOverFollowUp, installFollowUpSink, parseFollowUp, placeFollowUp } from './followUp';
import {
  isQueueKey,
  kindOf,
  queueKey,
  storedQueue,
  type Attempt,
  type AttemptReply,
  type Queued,
  type QueueStorage,
} from './outboxQueue';
import type { LocalGrade } from './points';
import { sendAttemptsTo, useFeedStore } from './store';

export type { Attempt, AttemptReply } from './outboxQueue';

/** The session as the outbox reads it: who is signed in, if the session has been read. */
export type SessionView = { status: 'loading' | 'signedOut' | 'signedIn'; userId: string | null };

export type OutboxDeps = {
  /**
   * Sends one attempt; resolves on a 2xx with the reply (nothing reads as no follow-up and no
   * points), rejects otherwise (an `ApiError` from the client).
   */
  post: (attempt: Queued) => Promise<AttemptReply> | Promise<void>;
  storage: QueueStorage;
  /** The session store (`useSession` in the app). */
  session: {
    getState: () => SessionView;
    subscribe: (listener: (state: SessionView) => void) => () => void;
  };
  /** Runs `run` after `ms`; returns the function that cancels it. */
  schedule: (run: () => void, ms: number) => () => void;
  newId: () => string;
};

export type Outbox = {
  add: (attempt: Attempt) => void;
  flush: () => Promise<void>;
  pending: () => number;
  subscribe: (listener: () => void) => () => void;
};

type Queue = ReturnType<typeof storedQueue>;

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

/** True when both grades are known and differ: the server regraded the app's answer. */
function regraded(local: LocalGrade['correct'], server: AttemptReply['correct']): boolean {
  return local !== null && typeof server === 'boolean' && local !== server;
}

/**
 * Settles the card of each attempt in `dropped`, which will never be sent, at 0: no provisional
 * value of theirs is left waiting (the `syncing` mark never sticks).
 */
function release(dropped: readonly Queued[]): void {
  dropped.forEach(({ cardId }) => useFeedStore.getState().settle(cardId, 0));
}

/**
 * Settles `head`'s card in the feed store at the points `reply` carries (none: 0), and logs
 * `attempt_regraded`, the card's kind only, when the reply's grade differs from the app's.
 */
function settleReply(head: Queued, reply: AttemptReply | undefined): void {
  const local = useFeedStore.getState().settle(head.cardId, reply?.points ?? 0);
  if (local === null || !regraded(local.correct, reply?.correct)) return;
  logWarning('attempt_regraded', { kind: local.kind });
}

/**
 * Posts `head`: true when it is done with, sent or refused for good (a 404, 409 or 422, logged
 * with its kind); false when it must wait for a retry. A sent attempt's follow-up goes to the
 * installed sink, which cannot make it unsent, and its reply settles the card's points
 * (`settleReply`); a refused attempt settles at 0.
 */
async function sendOne(post: OutboxDeps['post'], head: Queued): Promise<boolean> {
  let reply: AttemptReply | undefined;
  try {
    reply = (await post(head)) ?? undefined;
  } catch (error) {
    if (error instanceof ApiError && REFUSED.has(error.status)) {
      logWarning('attempt_dropped', { kind: error.kind, status: error.status });
      settleReply(head, undefined);
      return true;
    }
    logWarning('attempt_send_failed', { kind: kindOf(error) });
    return false;
  }
  handOverFollowUp(head, reply);
  settleReply(head, reply);
  return true;
}

/** Removes every stored queue but `keep`'s (`null`: all of them). */
async function sweep(storage: QueueStorage, keep: () => string | null): Promise<void> {
  try {
    const keys = await storage.getAllKeys();
    const kept = keep();
    const others = keys.filter((key) => isQueueKey(key) && key !== kept);
    await Promise.all(others.map((key) => storage.removeItem(key)));
  } catch (error) {
    logWarning('outbox_sweep_failed', { kind: kindOf(error) });
  }
}

/** An outbox over `deps` (see the module comment). It follows the session at once. */
export function createOutbox(deps: OutboxDeps): Outbox {
  let queue: Queue | null = null;
  /** The signed-in user's id; `undefined` until the session has been read. */
  let owner: string | null | undefined;
  let leaveQueue: () => void = () => undefined;
  const listeners = new Set<() => void>();
  let failures = 0;
  let cancelRetry: (() => void) | null = null;
  let running: { queue: Queue; done: Promise<void> } | null = null;

  const changed = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };
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
  // A pass sends `sending`'s attempts while it is still the queue: a change of user stops it after
  // the request in flight. `running` is cleared before the pass's promise settles, so a flush
  // asked for after the last attempt was checked starts a new pass rather than joining one that
  // has ended.
  const pass = async (sending: Queue): Promise<void> => {
    try {
      await sending.loaded;
      for (let head = sending.head(); head !== undefined && sending === queue;) {
        const sent = await sendOne(deps.post, head);
        if (!sent && sending === queue) retryLater();
        if (!sent) return;
        failures = 0;
        sending.remove(head);
        head = sending.head();
      }
    } finally {
      if (running?.queue === sending) running = null;
    }
  };
  const flush = (): Promise<void> => {
    if (queue === null) return Promise.resolve();
    stopRetry();
    if (running?.queue !== queue) running = { queue, done: pass(queue) };
    return running.done;
  };
  const follow = (state: SessionView) => {
    if (state.status === 'loading' || state.userId === owner) return;
    stopRetry();
    failures = 0;
    leaveQueue();
    release(queue?.discard() ?? []);
    owner = state.userId;
    queue = owner === null ? null : storedQueue(deps.storage, queueKey(owner));
    leaveQueue = queue?.subscribe(changed) ?? (() => undefined);
    void sweep(deps.storage, () => (owner ? queueKey(owner) : null));
    changed();
    void flush();
  };
  follow(deps.session.getState());
  deps.session.subscribe(follow);

  return {
    add: (attempt) => {
      if (queue === null) return;
      const entry = { ...attempt, response: cut(attempt.response), clientAttemptId: deps.newId() };
      release(queue.push(entry));
      void flush();
    },
    flush,
    pending: () => queue?.size() ?? 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type Client = NonNullable<typeof api>;

/** Posts `attempt` through the app's API client, in the API's snake_case body. */
async function post(client: Client, attempt: Queued): Promise<AttemptReply> {
  const { data } = await client.POST('/cards/{card_id}/attempt', {
    params: { path: { card_id: attempt.cardId } },
    body: {
      client_attempt_id: attempt.clientAttemptId,
      response: attempt.response,
      duration_ms: attempt.durationMs,
      feed_date: attempt.feedDate,
      set_number: attempt.setNumber,
    },
  });
  return {
    followUp: parseFollowUp(data?.follow_up),
    points: typeof data?.points === 'number' ? data.points : 0,
    correct: typeof data?.correct === 'boolean' ? data.correct : null,
  };
}

/** With the demo sets there is no API, and nothing to send. */
const INERT: Outbox = {
  add: () => undefined,
  flush: () => Promise.resolve(),
  pending: () => 0,
  subscribe: () => () => undefined,
};

/**
 * The app's outbox over the API client and async storage, for the user `useSession` holds. It
 * flushes when the app returns to the foreground, takes the feed store's answered cards, and
 * places each follow-up in the running set (`placeFollowUp`).
 */
function appOutbox(): Outbox {
  const client = api;
  if (client === null) return INERT;
  const outbox = createOutbox({
    post: (attempt) => post(client, attempt),
    storage: AsyncStorage,
    session: useSession,
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
  sendAttemptsTo(outbox);
  installFollowUpSink(placeFollowUp);
  return outbox;
}

export const outbox = appOutbox();
