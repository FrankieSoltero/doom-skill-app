/**
 * Pure text helpers behind the Summary card (docs/design/card-feed/README.md:143-153): its title
 * and its points tile's two lines. Kept apart from `SummaryCard` so they are tested without
 * rendering. Every word and every sentence shape comes from `copy`.
 */
import { copy } from '../copy';
import type { Card } from '../data';
import type { Tree } from '../topics/useTree';

/** `value` when it is a finite number above 0, else 0. */
function orZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * `n` as the title writes it at the start of a sentence: the capitalized word from `one` to
 * `twenty`, and digits for anything else (0, or above twenty).
 */
function spelled(n: number): string {
  const word = n >= 1 ? copy.numberWords[n - 1] : undefined;
  return word === undefined ? String(n) : word.charAt(0).toUpperCase() + word.slice(1);
}

/** `n` and its noun: the singular for exactly one, else the plural. */
function quantity(n: number, singular: string, plural: string): string {
  return copy.counted(spelled(n), n === 1 ? singular : plural);
}

/**
 * The Summary title, README.md:146: the cards done and the minutes they took, "Six cards. Nine
 * minutes.". Each count is a word up to twenty and digits above it, decided separately. Minutes
 * are `Math.max(1, Math.round(seconds / 60))`. A card count is rounded to a whole number. Either
 * input that is not finite, or is below 0, counts as 0, so `summaryTitle(0, 0)` is
 * "0 cards. One minute." (no Summary is reached with no cards).
 */
export function summaryTitle(cards: number, seconds: number): string {
  const { card, cards: cardsNoun, minute, minutes: minutesNoun } = copy.summaryNouns;
  const cardCount = Math.round(orZero(cards));
  const minuteCount = Math.max(1, Math.round(orZero(seconds) / 60));
  return copy.summaryTitle(
    quantity(cardCount, card, cardsNoun),
    quantity(minuteCount, minute, minutesNoun),
  );
}

/**
 * The points tile's headline, "+17 points": the points the set's attempts earned. Shown for a set
 * that earned none too ("+0 points"); a value that is not a number above 0 reads as 0.
 */
export function pointsGained(points: number): string {
  return copy.summary.pointsGained(orZero(points));
}

type Milestone = Tree['milestones'][number];

/** The milestone `card` counts toward in `tree`: a checkpoint's by position, else its node's. */
function milestoneOf(tree: Tree, card: Card): Milestone | undefined {
  if (card.type === 'checkpoint') {
    return tree.milestones.find((milestone) => milestone.position === card.milestone);
  }
  const node = tree.nodes.find((candidate) => candidate.title === card.node);
  return tree.milestones.find((milestone) => milestone.id === node?.milestone_id);
}

/**
 * The points tile's second line, "Rhythm basics: 12 / 100 points": the section of the set's last
 * card that has one in `tree` (a card's `node` is its node's title), with the section's earned
 * and target points. `null` (no line) without a tree, or when no card of the set has a section.
 */
export function sectionLine(tree: Tree | undefined, cards: readonly Card[]): string | null {
  if (tree === undefined) return null;
  for (const card of [...cards].reverse()) {
    const milestone = milestoneOf(tree, card);
    if (milestone !== undefined) {
      return copy.summary.sectionPoints(milestone.title, milestone.earned, milestone.target);
    }
  }
  return null;
}
