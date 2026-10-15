// Provisional points (offline-topic plan Task 7, spec O5): the points of the current set, part
// settled by the server's replies and part provisional, graded on the phone and waiting for the
// outbox to send them. Pure functions over the feed store's points fields (src/feed/store.ts),
// which hold them in memory only.
import type { Card, FeedSet } from '../data';
import type { CardAnswer } from './answers';
import type { Attempt } from './outboxQueue';

/** The app's own grade of an answer: the card's kind, and right or wrong (`null`: not graded). */
export type LocalGrade = { kind: Card['type']; correct: boolean | null };

/**
 * One provisional value: the points the app expects, and the grade it gave them for (`null`
 * when the caller gave none).
 */
export type Provisional = { points: number; grade: LocalGrade | null };

/** What a graded wrong answer pays on the server (`WRONG_POINTS`). */
const WRONG_POINTS = 1;

/**
 * Values waiting for a reply, by card id, in the order they were made: a card may be answered
 * more than once (an exercise checked again), and its replies come in that order.
 */
type Queues = Record<string, Provisional[]>;

export type PointsState = {
  /** The points the outbox's replies for the current set's cards brought (and `addPoints`). */
  settledPoints: number;
  /** The current set's values waiting for a reply. */
  provisional: Queues;
  /**
   * The values of earlier sets' cards still waiting for a reply: no longer counted (each set
   * counts its own), kept for the regrade check when the reply comes.
   */
  earlier: Queues;
  /** How many values wait in `provisional`: above 0, the Summary marks the points `syncing`. */
  pendingCount: number;
  /** The settled points plus the provisional ones: what the Summary shows. */
  pointsEarned: number;
};

/** `points` when it is a number above 0, else 0. */
function above0(points: number): number {
  return points > 0 ? points : 0;
}

/** The state of `settledPoints`, `provisional` and `earlier`, its count and sum worked out. */
function counted(settledPoints: number, provisional: Queues, earlier: Queues): PointsState {
  const values = Object.values(provisional).flat();
  const waiting = values.reduce((sum, value) => sum + value.points, 0);
  return {
    settledPoints,
    provisional,
    earlier,
    pendingCount: values.length,
    pointsEarned: settledPoints + waiting,
  };
}

/** `older` with `newer`'s values after its own, card by card. */
function joined(older: Queues, newer: Queues): Queues {
  const all = { ...older };
  Object.entries(newer).forEach(([cardId, values]) => {
    all[cardId] = [...(all[cardId] ?? []), ...values];
  });
  return all;
}

/**
 * The points of a new set: nothing counted, and the waiting values of `before` (the set ending),
 * if any, kept as `earlier`. The store's at `startSet`; `reset` starts from none at all.
 */
export function newSetPoints(before?: PointsState): PointsState {
  return counted(0, {}, before === undefined ? {} : joined(before.earlier, before.provisional));
}

/** `state` with `points` settled for no card: what `addPoints` adds. */
function withSettled(state: PointsState, points: number): PointsState {
  return counted(state.settledPoints + above0(points), state.provisional, state.earlier);
}

/**
 * `state` with `value` waiting for `cardId`'s reply. A value that is not above 0 (a skip, a review
 * rated `again`) adds nothing and waits for nothing.
 */
function withProvisional(state: PointsState, cardId: string, value: Provisional): PointsState {
  if (!(value.points > 0)) return state;
  const queued = [...(state.provisional[cardId] ?? []), value];
  return counted(state.settledPoints, { ...state.provisional, [cardId]: queued }, state.earlier);
}

/** `queues` without `cardId`'s oldest value, and that value's grade (`null`: none waited). */
function shifted(queues: Queues, cardId: string): { rest: Queues; local: LocalGrade | null } {
  const [first, ...later] = queues[cardId] ?? [];
  const { [cardId]: _replaced, ...others } = queues;
  const rest = later.length > 0 ? { ...others, [cardId]: later } : others;
  return { rest, local: first?.grade ?? null };
}

/**
 * `state` after the reply for `cardId` brought `serverPoints` (not a number above 0 reads as 0),
 * and the grade of the value it replaced. A card of the current set (`inSet`) has its oldest
 * provisional value replaced, and the points are settled even when none waited (a reply to an
 * attempt from an earlier run). A card of an earlier set changes nothing the set counts: only its
 * oldest `earlier` value goes.
 */
function settledWith(
  state: PointsState,
  cardId: string,
  serverPoints: number,
  inSet: boolean,
): { next: PointsState; local: LocalGrade | null } {
  if (!inSet) {
    const { rest, local } = shifted(state.earlier, cardId);
    return { next: { ...state, earlier: rest }, local };
  }
  const { rest, local } = shifted(state.provisional, cardId);
  return { next: counted(state.settledPoints + above0(serverPoints), rest, state.earlier), local };
}

/** The points fields after `attempt`, when one is handed to the outbox, adds `value`. */
export function sentValue(
  state: PointsState,
  attempt: Attempt | null,
  value: Provisional | null,
): Partial<PointsState> {
  return attempt === null || value === null ? {} : withProvisional(state, attempt.cardId, value);
}

/** The feed store's points actions (src/feed/store.ts). */
export type PointsActions = {
  /** Adds `points` to the settled points; an amount that is not above 0 adds nothing. */
  addPoints: (points: number) => void;
  /**
   * Adds `points` for `cardId` provisionally, graded `grade` on the phone, until the outbox's reply
   * settles it; an amount that is not above 0 (a skip) adds nothing and waits for nothing.
   */
  addProvisional: (cardId: string, points: number, grade?: LocalGrade) => void;
  /**
   * Replaces `cardId`'s oldest provisional value with the reply's `serverPoints` and returns the
   * grade it was given (`null`: none waited, and the points are still settled). For a card not in
   * the current set, the set's points are left alone and only the grade is returned.
   */
  settle: (cardId: string, serverPoints: number) => LocalGrade | null;
};

/** The points actions over the store's `setState` and `getState`. */
export function pointsActions(
  setState: (update: (state: PointsState) => Partial<PointsState>) => void,
  getState: () => PointsState & { set: FeedSet | null },
): PointsActions {
  return {
    addPoints: (points) => {
      setState((state) => withSettled(state, points));
    },
    addProvisional: (cardId, points, grade) => {
      setState((state) => withProvisional(state, cardId, { points, grade: grade ?? null }));
    },
    settle: (cardId, serverPoints) => {
      const state = getState();
      const inSet = state.set?.cards.some((card) => card.id === cardId) ?? false;
      const { next, local } = settledWith(state, cardId, serverPoints, inSet);
      setState(() => next);
      return local;
    },
  };
}

/** The value of a pick, a checked exercise or a review rating; `null` for anything else. */
function gradeOf(card: Card, answer: CardAnswer): boolean | null | undefined {
  if (answer.kind === 'choice' && 'correct' in card) {
    return answer.picked === card.correct;
  }
  if (answer.kind === 'exercise' && card.type === 'exercise' && answer.result !== null) {
    return answer.result === 'pass';
  }
  if (answer.kind === 'review' && card.type === 'review' && answer.rating !== null) return null;
  return undefined;
}

/**
 * The provisional value of `answer` to `card`, as the server would pay it: the card's `points`
 * when right, 1 when wrong; a review's `points` for any rating but `again` (0). `null` for an
 * answer the outbox is not handed (an edit, a reveal, a checkpoint, an answer of another kind).
 * A concept seen pays its `seenPoints` (`seenValue`).
 */
export function answerPoints(card: Card | undefined, answer: CardAnswer): Provisional | null {
  const correct = card === undefined ? undefined : gradeOf(card, answer);
  if (card === undefined || correct === undefined) return null;
  const again = answer.kind === 'review' && answer.rating === 0;
  const points = correct === false ? WRONG_POINTS : again ? 0 : card.points;
  return { points, grade: { kind: card.type, correct } };
}

/** The provisional value of seeing `card`: a concept's `seenPoints`, else `null`. */
export function seenValue(card: Card | undefined): Provisional | null {
  if (card?.type !== 'concept') return null;
  return { points: card.seenPoints, grade: { kind: 'concept', correct: null } };
}
