// The follow-up card (M9 plan H Task 3; spec 5.3, H1, H2): after a wrong first answer the server
// appends another practice card of the node to the stored set and returns it in the attempt's
// reply (`AttemptResult.follow_up`). The outbox reads it (`parseFollowUp`) and, after the 2xx,
// hands it to the installed sink (`handOverFollowUp`); the app installs `placeFollowUp`, which
// puts it two cards after the answered card, before the checkpoint. When the set on screen is
// another one, or the learner is already at or past that place, the card is dropped on the
// phone: the server holds it in the stored set, so a reload shows it. The logs carry a reason
// word and a class name only, never card text.
import type { Card } from '../data';
import { mapFeed } from '../data/mapFeed';
import { cardSchema } from '../data/schema';
import { logWarning } from '../log';
import { kindOf, type Attempt, type AttemptReply } from './outboxQueue';
import { checkpointIndex, useFeedStore } from './store';

/** A follow-up and the attempt it answers: the card answered, and its set's date and number. */
export type Placed = { card: Card; afterCardId: string; feedDate: string; setNumber: number };

/** Where the outbox hands a follow-up after a 2xx. */
export type FollowUpSink = (placed: Placed) => void;

type FeedState = Pick<ReturnType<typeof useFeedStore.getState>, 'set' | 'index'>;

/** Why a follow-up is not placed: the words `follow_up_dropped` logs. */
type Dropped = 'other_set' | 'not_in_set' | 'behind';

let sink: FollowUpSink | null = null;

/** Installs `next` as the place follow-ups go (`null` removes it; the demo installs none). */
export function installFollowUpSink(next: FollowUpSink | null): void {
  sink = next;
}

/**
 * The index the follow-up goes to, or why it does not. The set on screen must be the attempt's:
 * the same date and number, and holding the answered card (card ids are the server's, so this
 * also rules out another topic's set; an attempt names no topic).
 */
function targetOf(state: FeedState, placed: Placed): number | Dropped {
  const { set } = state;
  if (set?.feedDate !== placed.feedDate || set.setNumber !== placed.setNumber) return 'other_set';
  const answered = set.cards.findIndex((card) => card.id === placed.afterCardId);
  if (answered === -1) return 'not_in_set';
  const target = Math.min(answered + 2, checkpointIndex(set.cards));
  return state.index >= target ? 'behind' : target;
}

/**
 * Two cards after the answered card, clamped to the checkpoint's index; `null` when the set on
 * screen is not the attempt's, the answered card is not in it, or the learner is at or past it.
 */
export function followUpTarget(state: FeedState, placed: Placed): number | null {
  const target = targetOf(state, placed);
  return typeof target === 'number' ? target : null;
}

/**
 * Inserts the follow-up into the running set at its target (a card already in the set is not
 * inserted twice); else drops it, logging `follow_up_dropped` with the reason.
 */
export function placeFollowUp(placed: Placed): void {
  const store = useFeedStore.getState();
  const target = targetOf(store, placed);
  if (typeof target === 'number') {
    store.insertCard(placed.card, target);
    return;
  }
  logWarning('follow_up_dropped', { reason: target });
}

/**
 * The reply's `follow_up`, its keys mapped (`mapFeed`) and parsed with the feed's `cardSchema`;
 * `null` when there is none, and when it does not fit (logged as `follow_up_dropped`). Never
 * throws: the attempt it came with has been recorded either way.
 */
export function parseFollowUp(raw: unknown): Card | null {
  if (raw === null || raw === undefined) return null;
  const result = cardSchema.safeParse(mapFeed(raw));
  if (result.success) return result.data;
  logWarning('follow_up_dropped', { reason: 'unparsable' });
  return null;
}

/**
 * Hands the reply's follow-up, if any, to the installed sink, with the attempt's card, date and
 * set. No sink (the demo), no reply or no follow-up: nothing. A sink that throws is logged by
 * its class name; this never throws, so the attempt stays sent.
 */
export function handOverFollowUp(
  attempt: Pick<Attempt, 'cardId' | 'feedDate' | 'setNumber'>,
  reply: AttemptReply | undefined,
): void {
  const card = reply?.followUp ?? null;
  if (card === null || sink === null) return;
  const { cardId: afterCardId, feedDate, setNumber } = attempt;
  try {
    sink({ card, afterCardId, feedDate, setNumber });
  } catch (error) {
    logWarning('follow_up_dropped', { reason: 'failed', kind: kindOf(error) });
  }
}
