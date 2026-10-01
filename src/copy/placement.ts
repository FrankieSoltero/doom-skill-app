/**
 * UI strings of the placement quiz (K19): the placement screen (app/topic/[slug]/placement.tsx)
 * and the topic screen's reset row. Frozen here; read them as `placementCopy`.
 */
import { deepFreeze } from './index';

/** The line for a learner who starts at the first milestone (no band passed, or a skip). */
const FROM_THE_BEGINNING = 'Starting from the beginning';

export const placementCopy = deepFreeze({
  /** The intro card's title. */
  title: 'Quick check',
  /** The intro card's body: `count` is the number of cards in the set. */
  intro: (count: number) =>
    `${String(count)} questions to find your starting point. You can skip and start from the beginning.`,
  start: 'Start',
  skip: 'Skip',
  /** The progress line over a card: card `position` (from 1) of `total`. */
  progress: (position: number, total: number) => `${String(position)} of ${String(total)}`,
  /** The result card for a learner placed past the first band. */
  startingAt: (position: number, title: string) =>
    `Starting at milestone ${String(position)}: ${title}`,
  fromTheBeginning: FROM_THE_BEGINNING,
  /** The result card's button, which opens the Today feed. */
  goToFeed: "Go to today's set",
  /** Any failure to load the set or to save the placement, other than "placed already". */
  failed: 'Could not save your starting point. Starting from the beginning.',
  /** The topic screen's row that undoes a placement. */
  reset: 'Start from the beginning',
  /** The topic screen once the reset is done (or there was nothing to reset). */
  resetDone: `${FROM_THE_BEGINNING}.`,
  /** The topic screen when the reset limit (3 a day) is reached: a 429. */
  resetLimit: 'You can reset again tomorrow.',
  /** The topic screen when the reset failed for any other reason. */
  resetFailed: "Couldn't reset your starting point. Try again.",
} as const);
