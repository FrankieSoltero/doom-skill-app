/**
 * Pure helpers behind the feed header (docs/design/card-feed/README.md:27-30): its kicker text and
 * the progress bar's done count and segment fills. Kept apart from `FeedHeader` so they are
 * tested without rendering.
 */
import { copy } from '../copy';
import type { Card, FeedSet } from '../data';
import { cardTheme, colors } from '../theme';

/** The fill of a segment for a card not reached yet, README.md:30. */
const EMPTY_SEGMENT = 'transparent';

/**
 * The header's kicker: topic, day and horizon, plus the set number on any set after the day's
 * first. A `setNumber` below 1 cannot occur (the schema requires a positive integer) and reads
 * as the first set.
 */
export function kickerText(set: FeedSet): string {
  const { title, day, horizonDays } = set.topic;
  return set.setNumber > 1
    ? copy.kickerWithSet(title, day, horizonDays, set.setNumber)
    : copy.kicker(title, day, horizonDays);
}

/**
 * A card type's progress segment color: the card's own fill, except the exercise card, whose
 * fill is ink. Its segment is lime, the card's accent, as in the prototype's `cardCols`
 * (docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:506).
 */
export function segmentColor(cardType: Card['type']): string {
  return cardType === 'exercise' ? colors.lime : cardTheme[cardType].bg;
}

/**
 * The pager page as a whole number of 0 or more. A finite index is rounded, as the store rounds
 * it, and one below 0 reads as 0. An index that is not finite (`NaN`, `Infinity`) reads as 0,
 * so the first card shows as current.
 */
function wholeIndex(index: number): number {
  return Number.isFinite(index) ? Math.max(Math.round(index), 0) : 0;
}

/**
 * Cards done at pager page `index` of a set of `cardCount` cards, always a whole number from 0
 * to `cardCount`: the current card and every card before it, and all of them on the Summary page
 * (`index` equal to `cardCount`). An index past the Summary page reads as the Summary page. The
 * spoken progress value and the filled segments both come from this number.
 */
export function doneCount(index: number, cardCount: number): number {
  return Math.min(wholeIndex(index) + 1, cardCount);
}

/**
 * The streak the chip shows: a whole number of 0 or more. A fraction is floored; a value that is
 * not a finite number of 0 or more shows as 0.
 */
export function streakCount(streak: number): number {
  return Number.isFinite(streak) && streak >= 0 ? Math.floor(streak) : 0;
}

/**
 * Each segment's fill at page `index`, one per card: the card's color for the first
 * `doneCount(index, cards.length)` cards, else transparent (README.md:30).
 */
export function segmentFills(cards: readonly Card[], index: number): string[] {
  const done = doneCount(index, cards.length);
  return cards.map((card, position) => (position < done ? segmentColor(card.type) : EMPTY_SEGMENT));
}
