/**
 * The attempt outbox's queue (src/feed/outbox.ts): one user's attempts not yet sent, kept in async
 * storage under a key with the user's id (`queueKey`), at most 200. What storage holds is untrusted: an entry that does not fit
 * is dropped. The logs name kinds and counts only, never an answer's content.
 */
import { z } from 'zod';

import { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import type { Card } from '../data';
import { logWarning } from '../log';

/** An answer to one card, as the feed store hands it over. */
export type Attempt = {
  cardId: string;
  /** The answer the API takes for the card's type. */
  response: components['schemas']['AttemptResponse'];
  durationMs: number;
  /** The set's date and number, as the API served it. */
  feedDate: string;
  setNumber: number;
};

export type Queued = Attempt & { clientAttemptId: string };

/**
 * What the outbox reads from the API's reply to an attempt (`AttemptResult`): the optional
 * `follow_up`, the card the server added after a wrong answer, parsed; `null` when none. The
 * `points` the attempt earned, 0 when the reply has none (an older server). And the server's
 * grade, `correct`: `null` for an answer it does not grade (a review, a concept), absent from a
 * reply that has none.
 */
export type AttemptReply = { followUp: Card | null; points: number; correct?: boolean | null };

/** What the queue reads and writes: async storage in the app. */
export type QueueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
  getAllKeys: () => Promise<readonly string[]>;
};

/** The start of every queue's key; alone, the key an earlier version kept every user's under. */
const STORAGE_PREFIX = 'doomskill.outbox.v1';

/** The key `userId`'s attempts are kept under. */
export function queueKey(userId: string): string {
  return `${STORAGE_PREFIX}.${userId}`;
}

/** True for a key a queue is kept under, any user's, or the earlier version's shared one. */
export function isQueueKey(key: string): boolean {
  return key === STORAGE_PREFIX || key.startsWith(`${STORAGE_PREFIX}.`);
}
const MAX_ATTEMPTS = 200;

const queuedSchema = z.object({
  clientAttemptId: z.string().min(1),
  cardId: z.string().min(1),
  response: z.union([
    z.strictObject({ choice: z.number().int().nonnegative() }),
    z.strictObject({ code: z.string() }),
    z.strictObject({ rating: z.enum(['again', 'hard', 'good', 'easy']) }),
    z.strictObject({ seen: z.literal(true) }),
    z.strictObject({ skipped: z.literal(true) }),
  ]),
  durationMs: z.number().int().nonnegative(),
  feedDate: z.string(),
  setNumber: z.number().int().positive(),
});

/** The class name of a failure, or its kind for an `ApiError`: never its content. */
export function kindOf(error: unknown): string {
  if (error instanceof ApiError) return error.kind;
  return error instanceof Error ? error.name : typeof error;
}

/** The attempts stored as `text`, keeping only the entries that fit. */
function readStored(text: string | null): Queued[] {
  const entries = z.array(z.unknown()).parse(JSON.parse(text ?? '[]'));
  const kept = entries.flatMap((entry) => {
    const result = queuedSchema.safeParse(entry);
    return result.success ? [result.data] : [];
  });
  if (kept.length < entries.length) {
    logWarning('outbox_entries_invalid', { count: entries.length - kept.length });
  }
  return kept;
}

/**
 * The attempts not yet sent, in order, kept in step with storage under `key`: read once at the
 * start (what an earlier run left goes first), then written after every change, one write after
 * another, each writing the attempts as they are then. `changed` listeners hear of every change.
 * `discard()` empties it and removes its key after any write still pending; it changes nothing
 * after that.
 */
export function storedQueue(storage: QueueStorage, key: string) {
  let entries: Queued[] = [];
  let discarded = false;
  const listeners = new Set<() => void>();
  const changed = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };
  /** Drops the oldest attempts beyond 200, and returns them. */
  const keepAtMost = (): Queued[] => {
    const dropped = entries.slice(0, Math.max(entries.length - MAX_ATTEMPTS, 0));
    entries = entries.slice(dropped.length);
    dropped.forEach(() => {
      logWarning('attempt_dropped', { kind: 'full' });
    });
    return dropped;
  };
  const loaded = storage
    .getItem(key)
    .then(readStored)
    .catch((error: unknown) => {
      logWarning('outbox_load_failed', { kind: kindOf(error) });
      return [];
    })
    .then((earlier) => {
      if (discarded || earlier.length === 0) return;
      entries = [...earlier, ...entries];
      keepAtMost();
      changed();
    });
  let saving: Promise<void> = loaded;
  const update = (next: Queued[]): Queued[] => {
    if (discarded) return [];
    entries = next;
    const dropped = keepAtMost();
    saving = saving
      .then(() => storage.setItem(key, JSON.stringify(entries)))
      .catch((error: unknown) => {
        logWarning('outbox_save_failed', { kind: kindOf(error) });
      });
    changed();
    return dropped;
  };

  return {
    loaded,
    head: (): Queued | undefined => entries[0],
    size: () => entries.length,
    /** Adds `entry` at the end; returns the attempts dropped to keep at most 200. */
    push: (entry: Queued): Queued[] => update([...entries, entry]),
    remove: (sent: Queued) => {
      update(entries.filter((entry) => entry !== sent));
    },
    /** Empties the queue for good; returns the attempts it held, which will never be sent. */
    discard: (): Queued[] => {
      const held = discarded ? [] : entries;
      discarded = true;
      entries = [];
      saving = saving
        .then(() => storage.removeItem(key))
        .catch((error: unknown) => {
          logWarning('outbox_remove_failed', { kind: kindOf(error) });
        });
      changed();
      return held;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
