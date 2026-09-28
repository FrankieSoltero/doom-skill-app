// A content guard for the four demo sets, not a layout test: every limited card field is held to
// its character or row limit in `CARD_TEXT_LIMITS` (../textLimits.ts, which says how the limits
// were derived). A failing case names the set, the card and the field that is too long.
import solutions from '../../../scripts/__tests__/fixtures/demoSolutions.json';
import { copy } from '../../copy';
import { parseGrid } from '../../feed/exercise';
import extra from '../__fixtures__/cards.extra.fixture.json';
import fixture from '../__fixtures__/cards.fixture.json';
import type { Card, FeedSet } from '../index';
import { feedSetSchema } from '../schema';
import { CARD_TEXT_LIMITS, VERDICT_CHARS } from '../textLimits';

/** One measured field: where it is, its size, and its limit. */
type Measure = { where: string; size: number; limit: number };

/** The demo sets as the fixture source serves them: set 1, then sets 2 to 4. */
const SETS: FeedSet[] = [fixture, ...extra.sets].map(({ cards, summary }, at) =>
  feedSetSchema.parse({ topic: fixture.topic, setNumber: at + 1, cards, summary }),
);

/** The characters of `text` as drawn: bold markers (rule SS-11) are not drawn. */
function drawnLength(text: string): number {
  return text.replaceAll('**', '').length;
}

/** The exercise solution of set `setNumber`, from the evaluation test's fixture. */
function solutionOf(setNumber: number): string {
  const code = solutions.exercise[setNumber - 1];
  if (code === undefined) throw new Error(`No exercise solution for set ${String(setNumber)}`);
  return code;
}

/** The measures of one card; `at` names its set and type, as in `set 4 quiz`. */
function measuresOf(card: Card, at: string, setNumber: number): Measure[] {
  const measure = (field: string, size: number, limit: number) => ({
    where: `${at} ${field}`,
    size,
    limit,
  });
  switch (card.type) {
    case 'quiz': {
      const { title, explanation, options, option } = CARD_TEXT_LIMITS.quiz;
      return [
        measure('title', card.title.length, title),
        measure('explanation', drawnLength(card.explanation), explanation),
        measure('options', card.options.length, options),
        ...card.options.map((text, index) =>
          measure(`option ${String(index + 1)}`, text.length, option),
        ),
      ];
    }
    case 'predict': {
      const { title, explanation } = CARD_TEXT_LIMITS.predict;
      return [
        measure('title', card.title.length, title),
        measure('explanation', drawnLength(card.explanation), explanation),
      ];
    }
    case 'concept': {
      const { title, body } = CARD_TEXT_LIMITS.concept;
      return [
        measure('title', card.title.length, title),
        measure('body', drawnLength(card.body), body),
      ];
    }
    case 'checkpoint': {
      const { rubricRows, rubricLabel } = CARD_TEXT_LIMITS.checkpoint;
      return [
        measure('rubric rows', card.rubric.length, rubricRows),
        ...card.rubric.map((item, index) =>
          measure(`rubric label ${String(index + 1)}`, item.label.length, rubricLabel),
        ),
      ];
    }
    case 'exercise': {
      const { gridRows } = CARD_TEXT_LIMITS.exercise;
      return [
        measure('starter grid rows', parseGrid(card.starterCode).length, gridRows),
        measure('solution grid rows', parseGrid(solutionOf(setNumber)).length, gridRows),
      ];
    }
    case 'review':
      return [];
  }
}

/** Every measure of `set`'s cards. */
function measuresOfSet(set: FeedSet): Measure[] {
  return set.cards.flatMap((card) =>
    measuresOf(card, `set ${String(set.setNumber)} ${card.type}`, set.setNumber),
  );
}

/** The fields of `set` over their limit, by where they are. */
function overLimit(set: FeedSet): string[] {
  return measuresOfSet(set)
    .filter(({ size, limit }) => size > limit)
    .map(({ where }) => where);
}

describe('demo text limits', () => {
  it.each(SETS.flatMap(measuresOfSet))('$where: $size, limit $limit', ({ size, limit }) => {
    expect(size).toBeLessThanOrEqual(limit);
  });

  it('measures every limited card type in each set', () => {
    SETS.forEach((set) => {
      const types = new Set(measuresOfSet(set).map(({ where }) => where.split(' ')[2]));
      expect([...types].sort()).toEqual(['checkpoint', 'concept', 'exercise', 'predict', 'quiz']);
    });
  });

  it('counts the longer verdict, and the space after it, against the explanation', () => {
    expect(VERDICT_CHARS).toBe(Math.max(copy.correct.length, copy.notQuite.length) + 1);
  });

  it("names the field over its limit: set 4's quiz title as it was before this guard", () => {
    const [set4] = SETS.slice(3);
    if (set4 === undefined) throw new Error('No demo set 4');
    const title = 'Which pattern plays the original on the left and a reversed copy on the right?';
    const cards = set4.cards.map((card) => (card.type === 'quiz' ? { ...card, title } : card));

    expect(overLimit({ ...set4, cards })).toStrictEqual(['set 4 quiz title']);
  });
});
