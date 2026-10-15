/**
 * The persisted feed: the sets the app keeps for offline use, per user and topic, in async storage
 * under `feed:<userId>:<topicSlug>`, with the ids of the cards answered in each.
 *
 * - The payload is `{ version: 1, writtenAt, sets: [{ set, answered }] }`; `writtenAt` is the
 *   time (ms) it was last written, by a save or an answer.
 * - At most `PERSIST_SETS` sets per topic: a save keeps the last ones given. At most
 *   `PERSIST_TOPICS` topics per user: a save past it removes the user's oldest-written topics, a
 *   payload that cannot be read counting as the oldest.
 * - What storage holds is untrusted: a payload that fails the schema (an older version after an
 *   update, a set the card schema refuses) loads as `[]`, silently. Nothing here throws: a storage
 *   failure is logged by its kind and read as nothing stored.
 * - Writes run one after another, so answers marked together are all kept.
 * - When a signed-in user's data is cleared (`onSignOut`), every topic of the user who left goes,
 *   beside the outbox and the query cache; other users' keys stay.
 *
 * The store is unencrypted, like the outbox: card text and the learner's own answers, no
 * credentials. The logs name kinds only, never card text or answers.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { onSignOut, useSession } from '../auth/useSession';
import type { FeedSet } from '../data';
import { feedSetSchema } from '../data/schema';
import { logWarning } from '../log';
import { kindOf } from './outboxQueue';

export const PERSIST_VERSION = 1;
export const PERSIST_SETS = 4;
export const PERSIST_TOPICS = 5;

/** One kept set and the ids of its cards the learner has answered. */
export type PersistedEntry = { set: FeedSet; answered: string[] };

/** The start of every key `userId`'s topics are kept under. */
const userPrefix = (userId: string) => `feed:${userId}:`;

const keyOf = (userId: string, slug: string) => `${userPrefix(userId)}${slug}`;

/** A stored set: the card schema again, keeping the ids of the cards it was served without. */
const storedSetSchema = z.unknown().transform((raw, ctx): FeedSet => {
  const set = feedSetSchema.safeParse(raw);
  const kept = z.object({ droppedIds: z.array(z.string()).optional() }).safeParse(raw);
  if (!set.success || !kept.success) {
    ctx.addIssue({ code: 'custom', message: 'stored set' });
    return z.NEVER;
  }
  const droppedIds = [...(kept.data.droppedIds ?? []), ...(set.data.droppedIds ?? [])];
  return droppedIds.length > 0 ? { ...set.data, droppedIds } : set.data;
});

const payloadSchema = z.object({
  version: z.literal(PERSIST_VERSION),
  writtenAt: z.number(),
  sets: z
    .array(z.object({ set: storedSetSchema, answered: z.array(z.string()) }))
    .max(PERSIST_SETS),
});

type Payload = z.infer<typeof payloadSchema>;

/** The payload stored as `text`, or `null` when there is none or it fails the schema. */
function read(text: string | null): Payload | null {
  if (text === null) return null;
  try {
    const result = payloadSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function load(key: string): Promise<Payload | null> {
  try {
    return read(await AsyncStorage.getItem(key));
  } catch (error) {
    logWarning('persist_load_failed', { kind: kindOf(error) });
    return null;
  }
}

async function write(key: string, sets: PersistedEntry[]): Promise<void> {
  const payload = { version: PERSIST_VERSION, writtenAt: Date.now(), sets };
  await AsyncStorage.setItem(key, JSON.stringify(payload));
}

let writes: Promise<void> = Promise.resolve();

/** Runs `task` after every write asked for before it; a failure is logged as `event`, not thrown. */
function serial(event: string, task: () => Promise<void>): Promise<void> {
  const run = writes.then(task).catch((error: unknown) => {
    logWarning(event, { kind: kindOf(error) });
  });
  writes = run;
  return run;
}

/** Removes the user's oldest-written topics but `kept`, so at most `PERSIST_TOPICS` remain. */
async function evictTopics(userId: string, kept: string): Promise<void> {
  const others = (await AsyncStorage.getAllKeys()).filter(
    (key) => key.startsWith(userPrefix(userId)) && key !== kept,
  );
  if (others.length < PERSIST_TOPICS) return;
  const stored = await AsyncStorage.multiGet(others);
  const byAge = stored
    .map(([key, text]) => ({ key, writtenAt: read(text)?.writtenAt ?? -Infinity }))
    .sort((a, b) => a.writtenAt - b.writtenAt);
  const excess = byAge.slice(0, others.length - (PERSIST_TOPICS - 1)).map(({ key }) => key);
  await AsyncStorage.multiRemove(excess);
}

/** Keeps the last `PERSIST_SETS` of `entries` for `userId` in `slug` (see the module comment). */
export function savePersisted(
  userId: string,
  slug: string,
  entries: PersistedEntry[],
): Promise<void> {
  const key = keyOf(userId, slug);
  return serial('persist_save_failed', async () => {
    await write(key, entries.slice(-PERSIST_SETS));
    await evictTopics(userId, key);
  });
}

/** True when `set` holds the card `cardId`, shown or dropped. */
const holds = (set: FeedSet, cardId: string) =>
  set.cards.some(({ id }) => id === cardId) || (set.droppedIds ?? []).includes(cardId);

/**
 * Adds `cardId` to the answered ids of set `setNumber` kept for `userId` in `slug`, if kept; of
 * two kept sets with that number, the one holding the card.
 */
export function markAnswered(
  userId: string,
  slug: string,
  setNumber: number,
  cardId: string,
): Promise<void> {
  const key = keyOf(userId, slug);
  return serial('persist_save_failed', async () => {
    const sets = (await load(key))?.sets;
    // Two kept sets may share a number (other dates): the one that holds the card is meant.
    const numbered = sets?.filter(({ set }) => set.setNumber === setNumber) ?? [];
    const entry = numbered.find(({ set }) => holds(set, cardId)) ?? numbered[0];
    if (sets === undefined || entry === undefined || entry.answered.includes(cardId)) return;
    entry.answered.push(cardId);
    await write(key, sets);
  });
}

/** The sets kept for `userId` in `slug`, oldest first; `[]` when none can be read. */
export async function loadPersisted(userId: string, slug: string): Promise<PersistedEntry[]> {
  return (await load(keyOf(userId, slug)))?.sets ?? [];
}

/** Removes every topic kept for `userId`. */
export function clearPersisted(userId: string): Promise<void> {
  return serial('persist_clear_failed', async () => {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(userPrefix(userId))));
  });
}

// The session sets its new state before the sign-out listeners run, so the user who left is
// remembered from the change itself.
let leaving: string | null = null;
useSession.subscribe((state, previous) => {
  if (state.userId !== previous.userId) leaving = previous.userId;
});
onSignOut(() => {
  if (leaving !== null) void clearPersisted(leaving);
});
