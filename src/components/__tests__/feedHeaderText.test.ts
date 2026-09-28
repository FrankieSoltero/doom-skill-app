import type { Card, FeedSet } from '../../data';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { cardTheme, colors } from '../../theme';
import { doneCount, kickerText, segmentColor, segmentFills } from '../feedHeaderText';

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;

/** The demo day's six cards, in the fixture's order. */
const SIX: Card[] = [concept, quiz, predict, exercise, review, checkpoint];
/** Their segment colors, docs/design/card-feed/README.md:30 and the prototype's `cardCols`. */
const SIX_COLORS = [
  colors.violet,
  colors.coral,
  colors.aqua,
  colors.lime,
  colors.yellow,
  colors.pink,
];

/** The first `filled` of `fills`, the rest transparent. */
function firstFilled(fills: string[], filled: number): string[] {
  return fills.map((fill, position) => (position < filled ? fill : 'transparent'));
}

/** The demo topic, Strudel day 4 of 14, as set `setNumber` of the day. */
function strudelSet(setNumber: number): FeedSet {
  const set = makeSet(12, SIX);
  return { ...set, topic: { ...set.topic, day: 4, horizonDays: 14 }, setNumber };
}

describe('kickerText', () => {
  it('names the topic and the day on the first set', () => {
    expect(kickerText(strudelSet(1))).toBe('STRUDEL · DAY 4 OF 14');
  });

  it.each([
    { setNumber: 2, expected: 'STRUDEL · DAY 4 OF 14 · SET 2' },
    { setNumber: 3, expected: 'STRUDEL · DAY 4 OF 14 · SET 3' },
  ])('adds the set number on set $setNumber', ({ setNumber, expected }) => {
    expect(kickerText(strudelSet(setNumber))).toBe(expected);
  });
});

describe('segmentColor', () => {
  it.each([
    { type: 'concept', color: cardTheme.concept.bg },
    { type: 'quiz', color: cardTheme.quiz.bg },
    { type: 'predict', color: cardTheme.predict.bg },
    { type: 'review', color: cardTheme.review.bg },
    { type: 'checkpoint', color: cardTheme.checkpoint.bg },
  ] as const)('fills a $type segment with its card color', ({ type, color }) => {
    expect(segmentColor(type)).toBe(color);
  });

  it('fills an exercise segment lime, its accent, not its ink ground', () => {
    expect(segmentColor('exercise')).toBe(colors.lime);
    expect(segmentColor('exercise')).not.toBe(cardTheme.exercise.bg);
  });
});

describe('doneCount', () => {
  it.each([
    { index: 0, count: 6, done: 1 },
    { index: 2, count: 6, done: 3 },
    { index: 5, count: 6, done: 6 },
    { index: 6, count: 6, done: 6 },
    { index: 99, count: 6, done: 6 },
    { index: -1, count: 6, done: 1 },
    { index: -40, count: 4, done: 1 },
    { index: 0, count: 1, done: 1 },
    { index: 1, count: 1, done: 1 },
    { index: 0, count: 0, done: 0 },
  ])('counts $done done at index $index of $count cards', ({ index, count, done }) => {
    expect(doneCount(index, count)).toBe(done);
  });
});

describe('segmentFills', () => {
  it.each([
    { index: 0, filled: 1 },
    { index: 1, filled: 2 },
    { index: 2, filled: 3 },
    { index: 3, filled: 4 },
    { index: 4, filled: 5 },
    { index: 5, filled: 6 },
    { index: 6, filled: 6 },
  ])('fills $filled of 6 segments at index $index', ({ index, filled }) => {
    expect(segmentFills(SIX, index)).toStrictEqual(firstFilled(SIX_COLORS, filled));
  });

  it.each([
    { index: 0, filled: 1 },
    { index: 1, filled: 2 },
    { index: 3, filled: 4 },
    { index: 4, filled: 4 },
  ])('fills $filled of 4 segments at index $index', ({ index, filled }) => {
    const fills = [colors.coral, colors.lime, colors.violet, colors.yellow];

    expect(segmentFills([quiz, exercise, concept, review], index)).toStrictEqual(
      firstFilled(fills, filled),
    );
  });

  it.each([0, 1])('fills the one segment of a 1-card set at index %d', (index) => {
    expect(segmentFills([checkpoint], index)).toStrictEqual([colors.pink]);
  });

  it('treats an index below 0 as the first card and one past the Summary as the Summary', () => {
    expect(segmentFills(SIX, -3)).toStrictEqual(firstFilled(SIX_COLORS, 1));
    expect(segmentFills(SIX, 40)).toStrictEqual(SIX_COLORS);
  });

  it('has no segments for a set with no cards', () => {
    expect(segmentFills([], 0)).toStrictEqual([]);
  });
});
