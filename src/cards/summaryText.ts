/**
 * Pure text helpers behind the Summary card (docs/design/card-feed/README.md:143-153): its title
 * and its progress tile's value. Kept apart from `SummaryCard` so they are tested without
 * rendering. Every word and every sentence shape comes from `copy`.
 */
import { copy } from '../copy';

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
 * A topic's progress, a fraction from 0 to 1, as a whole percent, README.md:149 ("34%"). A value
 * outside 0 to 1 is limited to it; one that is not a number reads as 0.
 */
export function progressPercent(progress: number): string {
  return copy.percent(Math.round(Math.min(orZero(progress), 1) * 100));
}
