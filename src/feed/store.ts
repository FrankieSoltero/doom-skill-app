// The feed session: the set being worked through, the current page, the answers so far, and the
// day's totals and streak. Held in memory only; the store is not persisted, so "today" means
// since the store was created or last reset (the set round alone keeps counting across a reset).
// Each answered card of a set the API served is also handed to the attempt outbox, which sends it
// on its own (`sendAttemptsTo`, src/feed/outbox.ts), and so is each card the app dropped from a
// set (`droppedIds`), as skipped, when the session is served the set (`skipDropped`): the server
// finishes a set only when every card of it has an attempt.
import { create } from 'zustand';

import type { Card, FeedSet, Summary } from '../data';
import type { CardAnswer } from './answers';
import type { Attempt } from './outbox';

type FeedState = {
  set: FeedSet | null;
  index: number;
  answers: Record<number, CardAnswer>;
  totals: { cards: number; seconds: number };
  streak: number;
  streakCounted: boolean;
  /**
   * True once the current set has been added to the totals, so its Summary counts only once.
   * Every `startSet` clears it, even for the same set: the demo sets loop, and a repeated set is
   * real work that adds to the totals again (the streak still rises only once).
   */
  setCounted: boolean;
  /**
   * Counts the sets started since the store was created, from 1 (0 before the first). `reset`
   * keeps it. It changes in the same update as `set`, so the screen's page keys, which include
   * it, never show a new set under the keys of an earlier set.
   */
  round: number;
  /** When each page of the set was first shown (`Date.now()`), for the time an answer took. */
  shownAt: Record<number, number>;
  /** The concept pages of the set already handed to the outbox as seen. */
  seenSent: Record<number, true>;
  /**
   * The set's summary as the API recorded it (`useSummary`), shown in place of the projected
   * `set.summary`; `null` until then. Set at most once per set, so the numbers change once.
   */
  recordedSummary: Summary | null;
};

type FeedActions = {
  startSet: (set: FeedSet) => void;
  /** Hands the outbox a skip for each card dropped from `set`, which need not be started. */
  skipDropped: (set: FeedSet) => void;
  setIndex: (index: number) => void;
  setAnswer: (cardIndex: number, answer: CardAnswer) => void;
  reachSummary: () => void;
  /**
   * Keeps `summary` as the recorded summary of the set started in `round`; nothing when another
   * set is current by now, or when one is already kept.
   */
  recordSummary: (round: number, summary: Summary) => void;
  reset: () => void;
};

const initialState: FeedState = {
  set: null,
  index: 0,
  answers: {},
  totals: { cards: 0, seconds: 0 },
  streak: 0,
  streakCounted: false,
  setCounted: false,
  round: 0,
  shownAt: {},
  seenSent: {},
  recordedSummary: null,
};

/** Where the store hands each answered card: the attempt outbox, which installs itself. */
type AttemptSink = { add: (attempt: Attempt) => void };

let sink: AttemptSink | null = null;

/**
 * Installs `next` as the place answered cards go (`null` removes it). The app's outbox calls it
 * when it loads (src/feed/outbox.ts), so the store needs no import of the outbox, the API client
 * or the session, which imports the store.
 */
export function sendAttemptsTo(next: AttemptSink | null): void {
  sink = next;
}

/** The longest time an attempt may name: the API refuses more than an hour. */
const MAX_DURATION_MS = 3_600_000;

/** A stored review rating (the button's position) by the name the API takes. */
const RATING_NAMES = { 0: 'again', 1: 'hard', 2: 'good', 3: 'easy' } as const;

type AttemptResponse = Attempt['response'];
type ResponseRule = (answer: CardAnswer) => AttemptResponse | null;

const choiceResponse: ResponseRule = (answer) =>
  answer.kind === 'choice' ? { choice: answer.picked } : null;

/**
 * The answer the API records for each card type, or `null` for none: a checked exercise's code
 * (not an edit), a review's rating (not the reveal). A concept is recorded as seen when the
 * learner moves on from it (`setIndex`). A checkpoint's id is its milestone's, which the attempts
 * endpoint does not take (checkpoints are submitted in M5). An answer of another kind is none.
 */
const responses: { [Type in Card['type']]: ResponseRule } = {
  concept: () => null,
  quiz: choiceResponse,
  predict: choiceResponse,
  exercise: (answer) =>
    answer.kind === 'exercise' && answer.result !== null ? { code: answer.code } : null,
  review: (answer) =>
    answer.kind === 'review' && answer.rating !== null
      ? { rating: RATING_NAMES[answer.rating] }
      : null,
  checkpoint: () => null,
};

/**
 * The attempt at the card on `page`, answered `response` at `now`, or `null` when the set has no
 * date or the card no id (the demo sets): only cards the API served are sent. The time counts
 * from when the page was first shown, limited to what the API takes.
 */
function attemptAt(
  state: FeedState,
  page: number,
  response: AttemptResponse | null,
  now: number,
): Attempt | null {
  const { set } = state;
  const cardId = set?.cards[page]?.id;
  if (set?.feedDate === undefined || cardId === undefined || response === null) return null;
  const spent = Math.round(now - (state.shownAt[page] ?? now));
  return {
    cardId,
    response,
    durationMs: Math.min(Math.max(spent, 0), MAX_DURATION_MS),
    feedDate: set.feedDate,
    setNumber: set.setNumber,
  };
}

function send(attempt: Attempt | null): void {
  if (attempt !== null) sink?.add(attempt);
}

/** A skip for each card the app dropped from `set`; none for a set without a date (the demo). */
function skipsOf(set: FeedSet): Attempt[] {
  const { feedDate, setNumber, droppedIds = [] } = set;
  if (feedDate === undefined) return [];
  return droppedIds.map((cardId) => ({
    cardId,
    response: { skipped: true },
    durationMs: 0,
    feedDate,
    setNumber,
  }));
}

/** The concept page the learner leaves forward for `to`, not yet sent as seen; else `null`. */
function conceptLeft(state: FeedState, to: number): number | null {
  const from = state.index;
  const leaving = to > from && state.set?.cards[from]?.type === 'concept';
  return leaving && state.seenSent[from] === undefined ? from : null;
}

/** The pages of a set: one per card, then the Summary page. */
export function pageCount(set: FeedSet): number {
  return set.cards.length + 1;
}

/**
 * The page to store for a requested `index`: rounded to a whole page and limited to the pages of
 * the set, 0 when no set is started. A value that is not finite (a pager can report `NaN` from a
 * zero-width layout) keeps the current page, so a bad event does not send the learner back to
 * the first card.
 */
function nextIndex(state: FeedState, index: number): number {
  if (state.set === null) return 0;
  if (!Number.isFinite(index)) return state.index;
  return Math.min(Math.max(Math.round(index), 0), pageCount(state.set) - 1);
}

/**
 * The state after a new set starts, in the next round. The first set of the session brings its
 * topic's streak.
 */
function started(state: FeedState, set: FeedSet): Partial<FeedState> {
  const streak = state.set === null ? set.topic.streak : state.streak;
  return {
    set,
    index: 0,
    answers: {},
    streak,
    setCounted: false,
    round: state.round + 1,
    shownAt: { 0: Date.now() },
    seenSent: {},
    recordedSummary: null,
  };
}

/** The state after the Summary is reached: the set joins the totals once, the streak once a day. */
function summarized(state: FeedState): Partial<FeedState> {
  if (state.set === null || state.setCounted) return {};
  const { cards } = state.set;
  const seconds = cards.reduce((sum, card) => sum + card.estSeconds, 0);
  return {
    totals: { cards: state.totals.cards + cards.length, seconds: state.totals.seconds + seconds },
    streak: state.streakCounted ? state.streak : state.streak + 1,
    streakCounted: true,
    setCounted: true,
  };
}

export const useFeedStore = create<FeedState & FeedActions>()((setState, getState) => ({
  ...initialState,
  startSet: (set) => {
    setState((state) => started(state, set));
  },
  skipDropped: (set) => {
    skipsOf(set).forEach(send);
  },
  // Moving on from a concept card sends it as seen, once per set; a page is timed from when it
  // is first shown.
  setIndex: (index) => {
    const state = getState();
    const to = nextIndex(state, index);
    const now = Date.now();
    const left = conceptLeft(state, to);
    setState({
      index: to,
      shownAt: to in state.shownAt ? state.shownAt : { ...state.shownAt, [to]: now },
      seenSent: left === null ? state.seenSent : { ...state.seenSent, [left]: true },
    });
    if (left !== null) send(attemptAt(state, left, { seen: true }, now));
  },
  // The answer is stored at once, for the card and the gate; the outbox sends it on its own.
  setAnswer: (cardIndex, answer) => {
    const state = getState();
    const card = state.set?.cards[cardIndex];
    setState({ answers: { ...state.answers, [cardIndex]: answer } });
    const response = card === undefined ? null : responses[card.type](answer);
    send(attemptAt(state, cardIndex, response, Date.now()));
  },
  reachSummary: () => {
    setState(summarized);
  },
  recordSummary: (round, summary) => {
    setState((state) =>
      state.round === round && state.set !== null && state.recordedSummary === null
        ? { recordedSummary: summary }
        : {},
    );
  },
  // Every field returns to its start except `round`, which keeps counting: a set started after a
  // reset must not reuse the page keys of a set started before it.
  reset: () => {
    setState((state) => ({ ...initialState, round: state.round }));
  },
}));
