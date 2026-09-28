// The feed's gate as pure functions: whether the learner may move on, and where a move may go.
// The session hook calls them with the store's state at the moment of the move, not a render's.
import type { FeedSet } from '../data';
import type { CardAnswer } from './answers';
import { isAnswered } from './gating';

/** The parts of the feed store the gate reads. The store's own state fits it. */
export type GateState = { set: FeedSet | null; index: number; answers: Record<number, CardAnswer> };

/**
 * True when the learner may move on from the current page: a card that is answered, or that
 * failed to render (so a broken card does not trap the learner). Never from the Summary page.
 */
export function canAdvanceFrom(state: GateState, failed: ReadonlySet<number>): boolean {
  const card = state.set?.cards[state.index];
  if (card === undefined) return false;
  return failed.has(state.index) || isAnswered(card, state.answers[state.index]);
}

/**
 * What a card's "next" on `page` does: `go` one page on, `blocked` (the toast), or `none` when
 * `page` is not the current page (a late timer on a page the learner has left) or is not a card.
 */
export function nextMove(
  state: GateState,
  failed: ReadonlySet<number>,
  page: number,
): 'go' | 'blocked' | 'none' {
  if (page !== state.index || state.set?.cards[page] === undefined) return 'none';
  return canAdvanceFrom(state, failed) ? 'go' : 'blocked';
}

/** True when the pager may show `target`: any page back, or one page on through an open gate. */
export function canGoTo(state: GateState, failed: ReadonlySet<number>, target: number): boolean {
  if (target <= state.index) return true;
  return target === state.index + 1 && canAdvanceFrom(state, failed);
}
