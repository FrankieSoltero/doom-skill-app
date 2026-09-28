import {
  clampIndex,
  dragOffset,
  offsetFor,
  PEEK,
  pageHeight,
  pagerOutcome,
  SWIPE_DISTANCE,
  SWIPE_VELOCITY,
  swipeIntent,
} from '../pagerMath';
import type { PagerPlace, SwipeIntent } from '../pagerMath';

describe('pager geometry', () => {
  it('peeks 34 points of the next card, README.md:38', () => {
    expect(PEEK).toBe(34);
  });

  it.each([
    { pagerHeight: 700, expected: 666 },
    { pagerHeight: 34, expected: 0 },
    { pagerHeight: 20, expected: 0 },
    { pagerHeight: 0, expected: 0 },
  ])('a pager $pagerHeight tall has pages $expected tall', ({ pagerHeight, expected }) => {
    expect(pageHeight(pagerHeight)).toBe(expected);
  });

  it.each([
    { index: 2, pagerHeight: 700, expected: -1332 },
    { index: 1, pagerHeight: 700, expected: -666 },
    { index: 6, pagerHeight: 534, expected: -3000 },
    { index: 3, pagerHeight: 20, expected: 0 },
  ])(
    'page $index of a pager $pagerHeight tall sits at $expected',
    ({ index, pagerHeight, expected }) => {
      expect(offsetFor(index, pagerHeight)).toBe(expected);
    },
  );

  it.each([700, 0])('puts the first page at 0, not -0, in a pager %d tall', (pagerHeight) => {
    expect(Object.is(offsetFor(0, pagerHeight), 0)).toBe(true);
  });
});

describe('swipeIntent', () => {
  it('names its thresholds: 50 points and 600 points per second, README.md:42-43', () => {
    expect(SWIPE_DISTANCE).toBe(50);
    expect(SWIPE_VELOCITY).toBe(600);
  });

  it.each<{ translationY: number; velocityY: number; expected: SwipeIntent }>([
    // Distance alone.
    { translationY: -51, velocityY: 0, expected: 'next' },
    { translationY: -50, velocityY: 0, expected: 'none' },
    { translationY: 51, velocityY: 0, expected: 'back' },
    { translationY: 50, velocityY: 0, expected: 'none' },
    { translationY: 0, velocityY: 0, expected: 'none' },
    // Velocity alone.
    { translationY: 0, velocityY: -601, expected: 'next' },
    { translationY: 0, velocityY: -600, expected: 'none' },
    { translationY: 0, velocityY: 601, expected: 'back' },
    { translationY: 0, velocityY: 600, expected: 'none' },
    // Both agree.
    { translationY: -80, velocityY: -900, expected: 'next' },
    { translationY: 80, velocityY: 900, expected: 'back' },
    // They disagree: distance past its threshold decides.
    { translationY: -60, velocityY: 2000, expected: 'next' },
    { translationY: 60, velocityY: -2000, expected: 'back' },
    // They disagree: distance within its threshold, so velocity decides.
    { translationY: -50, velocityY: 700, expected: 'back' },
    { translationY: 40, velocityY: -700, expected: 'next' },
  ])(
    'moved $translationY at $velocityY per second: $expected',
    ({ translationY, velocityY, expected }) => {
      expect(swipeIntent(translationY, velocityY)).toBe(expected);
    },
  );
});

describe('pagerOutcome', () => {
  it.each<{
    row: string;
    intent: SwipeIntent;
    index: number;
    canAdvance: boolean;
    expected: object;
  }>([
    {
      row: 'advance allowed',
      intent: 'next',
      index: 2,
      canAdvance: true,
      expected: { kind: 'go', index: 3 },
    },
    {
      row: 'advance blocked',
      intent: 'next',
      index: 2,
      canAdvance: false,
      expected: { kind: 'blocked' },
    },
    {
      row: 'back, answered',
      intent: 'back',
      index: 2,
      canAdvance: true,
      expected: { kind: 'go', index: 1 },
    },
    {
      row: 'back, unanswered',
      intent: 'back',
      index: 2,
      canAdvance: false,
      expected: { kind: 'go', index: 1 },
    },
    {
      row: 'back at the first page',
      intent: 'back',
      index: 0,
      canAdvance: true,
      expected: { kind: 'none' },
    },
    {
      row: 'next on the last page',
      intent: 'next',
      index: 6,
      canAdvance: true,
      expected: { kind: 'none' },
    },
    {
      row: 'next on the last page, unanswered',
      intent: 'next',
      index: 6,
      canAdvance: false,
      expected: { kind: 'none' },
    },
    {
      row: 'a small move',
      intent: 'none',
      index: 2,
      canAdvance: false,
      expected: { kind: 'none' },
    },
    {
      row: 'advance to the last page',
      intent: 'next',
      index: 5,
      canAdvance: true,
      expected: { kind: 'go', index: 6 },
    },
  ])('$row', ({ intent, index, canAdvance, expected }) => {
    expect(pagerOutcome({ intent, index, pageCount: 7, canAdvance })).toStrictEqual(expected);
  });

  it('does nothing when there is only one page', () => {
    const place = { index: 0, pageCount: 1, canAdvance: true };
    expect(pagerOutcome({ ...place, intent: 'next' })).toStrictEqual({ kind: 'none' });
    expect(pagerOutcome({ ...place, intent: 'back' })).toStrictEqual({ kind: 'none' });
  });
});

describe('clampIndex', () => {
  it.each([
    { index: 3, pageCount: 7, expected: 3 },
    { index: -2, pageCount: 7, expected: 0 },
    { index: 9, pageCount: 7, expected: 6 },
    { index: 2.6, pageCount: 7, expected: 3 },
    { index: Number.NaN, pageCount: 7, expected: 0 },
    { index: Number.POSITIVE_INFINITY, pageCount: 7, expected: 6 },
    { index: Number.NEGATIVE_INFINITY, pageCount: 7, expected: 0 },
    { index: 4, pageCount: 0, expected: 0 },
  ])('shows index $index of $pageCount pages as $expected', ({ index, pageCount, expected }) => {
    expect(Object.is(clampIndex(index, pageCount), expected)).toBe(true);
  });
});

describe('dragOffset', () => {
  const middle: PagerPlace = { index: 2, pageCount: 7, canAdvance: true };

  it.each([
    { translationY: -80, expected: -80 },
    { translationY: 80, expected: 80 },
  ])('follows the finger between the ends: $translationY', ({ translationY, expected }) => {
    expect(dragOffset(translationY, middle)).toBe(expected);
  });

  it.each<{ row: string; translationY: number; place: PagerPlace }>([
    { row: 'down from the first page', translationY: 80, place: { ...middle, index: 0 } },
    { row: 'up from the last page', translationY: -80, place: { ...middle, index: 6 } },
    {
      row: 'up from an unanswered card',
      translationY: -80,
      place: { ...middle, canAdvance: false },
    },
  ])('resists a drag $row: it moves a third as far', ({ translationY, place }) => {
    expect(dragOffset(translationY, place)).toBeCloseTo(translationY / 3);
  });

  it('lets an unanswered card go back freely', () => {
    expect(dragOffset(80, { ...middle, canAdvance: false })).toBe(80);
  });
});
