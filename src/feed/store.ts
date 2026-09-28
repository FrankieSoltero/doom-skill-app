// The feed session: the set being worked through, the current page, the answers so far, and the
// day's totals and streak. Held in memory only; the store is not persisted, so "today" means
// since the store was created or last reset (the set round alone keeps counting across a reset).
import { create } from 'zustand';

import type { FeedSet } from '../data';
import type { CardAnswer } from './answers';

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
};

type FeedActions = {
  startSet: (set: FeedSet) => void;
  setIndex: (index: number) => void;
  setAnswer: (cardIndex: number, answer: CardAnswer) => void;
  reachSummary: () => void;
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
};

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
  return { set, index: 0, answers: {}, streak, setCounted: false, round: state.round + 1 };
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

export const useFeedStore = create<FeedState & FeedActions>()((setState) => ({
  ...initialState,
  startSet: (set) => {
    setState((state) => started(state, set));
  },
  setIndex: (index) => {
    setState((state) => ({ index: nextIndex(state, index) }));
  },
  setAnswer: (cardIndex, answer) => {
    setState((state) => ({ answers: { ...state.answers, [cardIndex]: answer } }));
  },
  reachSummary: () => {
    setState(summarized);
  },
  // Every field returns to its start except `round`, which keeps counting: a set started after a
  // reset must not reuse the page keys of a set started before it.
  reset: () => {
    setState((state) => ({ ...initialState, round: state.round }));
  },
}));
