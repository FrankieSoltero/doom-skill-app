/**
 * The feed pager's arithmetic and decisions, free of React and Reanimated so they can be tested as
 * plain functions (docs/design/card-feed/README.md:37-44).
 *
 * `dragOffset` runs on the UI thread inside the pan gesture's update callback, so it carries the
 * `'worklet'` directive: the worklets Babel plugin (added by babel-preset-expo) compiles it into a
 * worklet for the device, and in Jest it stays an ordinary function. The other functions run on
 * the JS thread only: the gesture hands its release back to JS with `scheduleOnRN`.
 */

/** How much of the next card peeks up from the bottom, README.md:38. */
export const PEEK = 34;
/** A drag farther than this (points) is a swipe, README.md:42-43. */
export const SWIPE_DISTANCE = 50;
/**
 * A fling faster than this (points per second) is a swipe. README.md:42 says "the fling velocity
 * passes a threshold"; the value is the sketch's, docs/design/card-feed/rn-effects.md:46-47.
 */
export const SWIPE_VELOCITY = 600;
/**
 * How far a page moves per point of drag where the pager cannot go: past either end, or up from a
 * card that must be answered first. The design gives no value; a third reads as resistance and
 * still shows the drag was seen.
 */
const DRAG_RESISTANCE = 1 / 3;

export type SwipeIntent = 'next' | 'back' | 'none';

/** Where the learner is: the current page, how many pages there are, and the gate. */
export type PagerPlace = { index: number; pageCount: number; canAdvance: boolean };

/** What a swipe or an accessibility action does: move to a page, show the gate, or nothing. */
export type PagerOutcome = { kind: 'go'; index: number } | { kind: 'blocked' } | { kind: 'none' };

/** The height of one page: the pager less the peek, never negative. */
export function pageHeight(pagerHeight: number): number {
  return Math.max(0, pagerHeight - PEEK);
}

/** The pages' vertical offset that shows page `index`: README.md:41. The first page is at +0. */
export function offsetFor(index: number, pagerHeight: number): number {
  return 0 - index * pageHeight(pagerHeight);
}

/**
 * What a released drag asks for. Distance decides when it passes its threshold; velocity is
 * consulted only when the distance is within it, so a long drag up that ends in a flick down still
 * advances. A value exactly at a threshold does not pass it.
 */
export function swipeIntent(translationY: number, velocityY: number): SwipeIntent {
  if (translationY < -SWIPE_DISTANCE) return 'next';
  if (translationY > SWIPE_DISTANCE) return 'back';
  if (velocityY < -SWIPE_VELOCITY) return 'next';
  if (velocityY > SWIPE_VELOCITY) return 'back';
  return 'none';
}

/**
 * The outcome of an intent at a place, README.md:39-44. Going back is always allowed; advancing
 * needs `canAdvance`. At either end nothing happens, and the last page shows no gate.
 */
export function pagerOutcome({
  intent,
  index,
  pageCount,
  canAdvance,
}: PagerPlace & { intent: SwipeIntent }): PagerOutcome {
  if (intent === 'back') return index > 0 ? { kind: 'go', index: index - 1 } : { kind: 'none' };
  if (intent === 'none' || index >= pageCount - 1) return { kind: 'none' };
  return canAdvance ? { kind: 'go', index: index + 1 } : { kind: 'blocked' };
}

/**
 * The page to show for a requested `index`: rounded and limited to the pages there are. A value
 * that is not finite shows the first page.
 */
export function clampIndex(index: number, pageCount: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.round(index), pageCount - 1));
}

/**
 * How far the pages follow a drag of `translationY`: fully where the pager can go, a third as far
 * where it cannot (see DRAG_RESISTANCE).
 */
export function dragOffset(translationY: number, place: PagerPlace): number {
  'worklet';
  const pastStart = translationY > 0 && place.index <= 0;
  const cannotAdvance = !place.canAdvance || place.index >= place.pageCount - 1;
  const pastEnd = translationY < 0 && cannotAdvance;
  return pastStart || pastEnd ? translationY * DRAG_RESISTANCE : translationY;
}
