/**
 * The feed's kept sets (offline-topic plan Task 6, O1 and O2): what the session keeps on the phone
 * for a learner who loses the connection, and what it serves from them.
 *
 * - After each set the server serves (`keepServed`), the set is kept with the sets the server
 *   already held after it, then `source.ahead(topic, AHEAD_SETS)` is asked for and the set is kept
 *   with those instead. One `ahead` request at a time: a set served while one is in flight asks
 *   for none. An `ahead` that fails is ignored, logged with its kind only.
 * - Every set is kept with the ids of its answered cards, carried forward from what was kept and
 *   from the store's answers to the set on screen (`persist.ts` keeps only what it is given).
 *   Cards dropped from a set count as answered once their skips are sent.
 * - `keepAnswers` marks each card the learner answers (a concept once left, any other card once
 *   its answer passes the gate) in the kept set.
 * - `keptSet` is what a load that failed offline (`isOfflineFailure`) serves: the first kept set
 *   whose renderable cards are not all answered, with only its unanswered cards, whatever its
 *   `feedDate`; `null` when none is left; `undefined` when nothing can be kept (no signed-in user
 *   or no active topic), so the failure stays the error it was.
 *
 * Logs carry kinds only, never card text or answers.
 */
import { useSession } from '../auth/useSession';
import { FeedLoadError, type Card, type CardSource, type FeedSet } from '../data';
import { logWarning } from '../log';
import { kindOf } from './outboxQueue';
import { isAnswered } from './gating';
import { loadPersisted, markAnswered, savePersisted, type PersistedEntry } from './persist';
import { useFeedStore } from './store';
import { activeTopic } from './useActiveTopic';

/** The sets asked for ahead of the one served (`MAX_AHEAD_SETS` on the server). */
const AHEAD_SETS = 3;

/** The failure kinds that mean the server could not be reached. */
const OFFLINE_KINDS: ReadonlySet<string> = new Set(['offline', 'timeout']);

type FeedState = ReturnType<typeof useFeedStore.getState>;
type Holder = { userId: string; slug: string };

/** The signed-in user and `slug`, whose sets are kept together; `null` when either is missing. */
function holderOf(slug: string | null | undefined): Holder | null {
  const { userId } = useSession.getState();
  return userId === null || slug === null || slug === undefined ? null : { userId, slug };
}

/** True for a load that failed because the server could not be reached. */
export function isOfflineFailure(error: unknown): boolean {
  return error instanceof FeedLoadError && OFFLINE_KINDS.has(error.kind);
}

const sameSet = (a: FeedSet, b: FeedSet) =>
  a.setNumber === b.setNumber && a.feedDate === b.feedDate;

/** The ids of the cards of the store's set the learner has answered. */
function answeredIds({ set, answers, seenSent }: Pick<FeedState, 'set' | 'answers' | 'seenSent'>) {
  return (set?.cards ?? []).flatMap((card, page) => {
    const done =
      card.type === 'concept' ? seenSent[page] === true : isAnswered(card, answers[page]);
    return done && card.id !== undefined ? [card.id] : [];
  });
}

/** The ids answered in `set`: kept before, and on screen now when it is the store's set. */
function answeredIn(set: FeedSet, stored: PersistedEntry[]): Set<string> {
  const before = stored.find((entry) => sameSet(entry.set, set))?.answered ?? [];
  const state = useFeedStore.getState();
  const now = state.set !== null && sameSet(state.set, set) ? answeredIds(state) : [];
  return new Set([...before, ...now]);
}

/**
 * Keeps `served` (its dropped cards answered: their skips were sent) and after it `ahead`, or
 * when that is `null` the sets kept after it before.
 */
async function keep(holder: Holder, served: FeedSet, ahead: FeedSet[] | null): Promise<void> {
  const stored = await loadPersisted(holder.userId, holder.slug);
  const at = stored.findIndex((entry) => sameSet(entry.set, served));
  const following = ahead ?? (at === -1 ? [] : stored.slice(at + 1).map(({ set }) => set));
  const entries = [served, ...following].map((set) => {
    const answered = answeredIn(set, stored);
    if (set === served) (served.droppedIds ?? []).forEach((id) => answered.add(id));
    return { set, answered: [...answered] };
  });
  await savePersisted(holder.userId, holder.slug, entries);
}

let aheadInFlight = false;

/** Keeps the set the server served, then the sets ahead of it (see the module comment). */
export async function keepServed(source: CardSource, served: FeedSet): Promise<void> {
  const holder = holderOf(served.topic.slug);
  if (holder === null) return;
  const keptNow = keep(holder, served, null);
  if (aheadInFlight) return keptNow;
  aheadInFlight = true;
  try {
    const [, ahead] = await Promise.all([keptNow, source.ahead(holder.slug, AHEAD_SETS)]);
    await keep(holder, served, ahead);
  } catch (error) {
    const kind = error instanceof FeedLoadError ? error.kind : kindOf(error);
    logWarning('feed_ahead_failed', { kind });
  } finally {
    aheadInFlight = false;
  }
}

/** Marks `ids` answered in set `set`, kept for `holder`. */
function markAll(holder: Holder, set: FeedSet, ids: Iterable<string>): void {
  for (const id of ids) void markAnswered(holder.userId, holder.slug, set.setNumber, id);
}

/**
 * Marks each card the learner answers in its kept set, from now until the returned function is
 * called.
 */
export function keepAnswers(): () => void {
  return useFeedStore.subscribe((state, previous) => {
    if (state.answers === previous.answers && state.seenSent === previous.seenSent) return;
    const holder = holderOf(state.set?.topic.slug);
    if (holder === null || state.set === null) return;
    const before = new Set(answeredIds(previous));
    markAll(
      holder,
      state.set,
      answeredIds(state).filter((id) => !before.has(id)),
    );
  });
}

/** `entry`'s set with only its unanswered cards; `null` when every card it can show is answered. */
function unanswered(
  entry: PersistedEntry,
  answered: Set<string>,
  canRender: (card: Card) => boolean,
): FeedSet | null {
  const open = (card: Card) => card.id === undefined || !answered.has(card.id);
  const cards = entry.set.cards.filter(open);
  if (!cards.some(canRender)) return null;
  const droppedIds = (entry.set.droppedIds ?? []).filter((id) => !answered.has(id));
  return { ...entry.set, cards, droppedIds };
}

/** The set to serve when a load failed offline (see the module comment). */
export async function keptSet(
  canRender: (card: Card) => boolean,
): Promise<FeedSet | null | undefined> {
  const holder = holderOf(activeTopic());
  if (holder === null) return undefined;
  const stored = await loadPersisted(holder.userId, holder.slug);
  for (const entry of stored) {
    const answered = answeredIn(entry.set, stored);
    const set = unanswered(entry, answered, canRender);
    if (set === null) continue;
    // Its dropped cards are skipped when it is served: they count as answered from now.
    markAll(holder, set, set.droppedIds ?? []);
    return set;
  }
  return null;
}
