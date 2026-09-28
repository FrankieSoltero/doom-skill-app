// The content rules for the demo sets (task 29): card mix and order, node names from the topic
// tree, the choice cards, the exercises and checkpoints against their stated solutions, the
// summaries, and the code the app colors and grades. Strudel's own evaluation of the same content
// runs under Node's test runner in scripts/__tests__/demoContent.eval.test.mjs, because
// @strudel/web ships only ES modules that Jest here does not load.
import solutions from '../../../scripts/__tests__/fixtures/demoSolutions.json';
import { summaryTitle } from '../../cards/summaryText';
import { tokenizeCode } from '../../components/codeTokens';
import { gradeCheckpoint, MAX_CODE_LENGTH } from '../../feed/checkpoint';
import { checkExercise, parseGrid } from '../../feed/exercise';
import { patternSpeedMs } from '../../feed/testing/patternSpeed';
import extra from '../__fixtures__/cards.extra.fixture.json';
import fixture from '../__fixtures__/cards.fixture.json';
import { createFixtureSource } from '../fixtureSource';
import type { Card, FeedSet } from '../index';
import { feedSetSchema } from '../schema';

const CARD_ORDER = ['concept', 'quiz', 'predict', 'exercise', 'review', 'checkpoint'];
const NEW_SETS = [
  { setNumber: 2, topics: ['Polyphony ,', 'Euclid ( , )'], milestone: 2, starterScore: 2 },
  { setNumber: 3, topics: ['.fast / .slow', '.rev and .every'], milestone: 3, starterScore: 3 },
  { setNumber: 4, topics: ['.jux and .off', 'Effects chain'], milestone: 4, starterScore: 2 },
];
const ESTIMATES: Record<Card['type'], [number, number]> = {
  concept: [40, 60],
  quiz: [30, 45],
  predict: [45, 60],
  exercise: [90, 120],
  review: [20, 20],
  checkpoint: [180, 180],
};
/** Card fields that may mark bold with `**` (the comment above the schemas in schema.ts). */
const PROSE_FIELDS: ReadonlySet<string> = new Set([
  'body',
  'explanation',
  'answer',
  'passMsg',
  'failMsg',
]);
const CODE_FIELDS = ['snippet', 'snippetComment', 'code', 'starterCode'];
/** Sample names checked against tidalcycles/dirt-samples' strudel.json, the app's sample map. */
const SAMPLE_NAMES = ['bd', 'sd', 'hh', 'cp'];
const SPEED_LIMIT_MS = 100;
const TREE_NODES = fixture.tree
  .flatMap((milestone) => milestone.nodes.map((node) => node[0]))
  .filter((name): name is string => typeof name === 'string');

let sets: FeedSet[] = [];

beforeAll(async () => {
  const source = createFixtureSource();
  for (let call = 0; call < 4; call += 1) {
    const set = await source.getNextSet();
    if (!set) throw new Error('The demo source served no set');
    sets.push(set);
  }
});

afterAll(() => {
  sets = [];
});

function setAt(setNumber: number): FeedSet {
  const set = sets[setNumber - 1];
  if (!set) throw new Error(`No demo set ${String(setNumber)}`);
  return set;
}

function cardOf<Type extends Card['type']>(
  set: FeedSet,
  type: Type,
): Extract<Card, { type: Type }> {
  const card = set.cards.find((item): item is Extract<Card, { type: Type }> => item.type === type);
  if (!card) throw new Error(`Set ${String(set.setNumber)} has no ${type} card`);
  return card;
}

function solution(kind: 'exercise' | 'checkpoint', setNumber: number): string {
  const code = solutions[kind][setNumber - 1];
  if (code === undefined) throw new Error(`No ${kind} solution for set ${String(setNumber)}`);
  return code;
}

/** The node every card but the checkpoint names. */
function nodesOf(set: FeedSet): string[] {
  return set.cards.flatMap((card) => ('node' in card ? [card.node] : []));
}

/** Every string inside `value`, at any depth. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value).flatMap(stringsIn);
}

/** Every code string a card shows: its code fields, and a quiz's options, which are code. */
function codeOf(card: Card): string[] {
  const fields = Object.entries(card)
    .filter(([key]) => CODE_FIELDS.includes(key))
    .flatMap(([, value]) => stringsIn(value));
  return card.type === 'quiz' ? [...fields, ...card.options] : fields;
}

/** The sample names in every `s("...")` of `code`. */
function samplesIn(code: string): string[] {
  return (code.match(/\bs\("[^"]*"\)/g) ?? []).flatMap(
    (call) => call.slice('s("'.length, -'")'.length).match(/[a-z]+/g) ?? [],
  );
}

/** How many lines differ between two texts with the same number of lines. */
function changedLines(before: string, after: string): number {
  const afterLines = after.split('\n');
  const beforeLines = before.split('\n');
  expect(afterLines).toHaveLength(beforeLines.length);
  return beforeLines.filter((line, at) => line !== afterLines[at]).length;
}

/** True when `explanation` holds a run of 2 or more word characters from one of `sources`. */
function sharesAFragment(explanation: string, sources: string[]): boolean {
  return sources
    .flatMap((source) => source.match(/\w{2,}/g) ?? [])
    .some((fragment) => explanation.includes(fragment));
}

/** Every node the sets before set `setNumber` taught or moved. */
function touchedBefore(setNumber: number): string[] {
  return sets
    .slice(0, setNumber - 1)
    .flatMap((before) => [...nodesOf(before), ...before.summary.moved.map(([name]) => name)]);
}

describe.each(NEW_SETS)('demo set $setNumber', ({ setNumber, topics, milestone, starterScore }) => {
  const set = () => setAt(setNumber);

  it('parses from the extra fixture with the shared topic, one card of each type in order', () => {
    const raw = extra.sets[setNumber - 2];
    const parsed = feedSetSchema.safeParse({ topic: fixture.topic, setNumber, ...raw });

    expect(parsed.error).toBeUndefined();
    expect(set().cards.map((card) => card.type)).toEqual(CARD_ORDER);
  });

  it('teaches its two topic nodes, naming only nodes of the topic tree', () => {
    const taught = set().cards.filter((card) => card.type !== 'review');

    expect([...new Set(nodesOf({ ...set(), cards: taught }))].sort()).toEqual([...topics].sort());
    expect(TREE_NODES).toEqual(expect.arrayContaining(nodesOf(set())));
    expect(TREE_NODES).toEqual(expect.arrayContaining(set().summary.moved.map(([name]) => name)));
  });

  it('reviews a node an earlier set touched, with the ratings of set 1', () => {
    const review = cardOf(set(), 'review');

    expect(touchedBefore(setNumber)).toContain(review.node);
    expect(TREE_NODES).toContain(review.node);
    expect(review.ratings).toEqual(cardOf(setAt(1), 'review').ratings);
  });

  it('gives each card an estimate in the range for its type', () => {
    set().cards.forEach((card) => {
      const [low, high] = ESTIMATES[card.type];
      expect([card.type, card.estSeconds >= low && card.estSeconds <= high]).toEqual([
        card.type,
        true,
      ]);
    });
  });

  it.each(['quiz', 'predict'] as const)('has a %s card with one explained answer', (type) => {
    const card = cardOf(set(), type);
    const correct = card.options[card.correct] ?? '';
    const code = card.type === 'predict' ? [card.code] : [];

    expect(card.options).toHaveLength(4);
    expect(new Set(card.options).size).toBe(4);
    expect(card.explanation.length).toBeGreaterThanOrEqual(40);
    expect(sharesAFragment(card.explanation, [correct, ...code])).toBe(true);
    // Quiz options are code, each a call; predict options are short plain phrases.
    card.options.forEach((option) => {
      expect(type === 'quiz' ? /^\w+\(/.test(option) : /^[^"()]{1,40}$/.test(option)).toBe(true);
    });
  });

  it('has an exercise the starter fails and a one-line edit passes, with a beat grid', () => {
    const card = cardOf(set(), 'exercise');
    const solved = solution('exercise', setNumber);

    expect(card.lang).toBe('strudel');
    expect(card.checks.every((check) => check.ignoreWhitespace)).toBe(true);
    expect(checkExercise(card.starterCode, card.checks)).toBe(false);
    expect(checkExercise(solved, card.checks)).toBe(true);
    expect(changedLines(card.starterCode, solved)).toBe(1);
    expect(parseGrid(card.starterCode).length).toBeGreaterThan(0);
    expect(parseGrid(solved).length).toBeGreaterThan(0);
  });

  it(`has a checkpoint for milestone ${String(milestone)}: 3 of 4, starter ${String(starterScore)}, solution 4`, () => {
    const card = cardOf(set(), 'checkpoint');
    const start = gradeCheckpoint(card.starterCode, card);

    expect([card.milestone, card.milestoneCount]).toEqual([milestone, fixture.tree.length]);
    expect([card.rubric.length, card.passThreshold]).toEqual([4, 3]);
    expect([start.passCount, start.passed]).toEqual([starterScore, starterScore >= 3]);
    expect(gradeCheckpoint(solution('checkpoint', setNumber), card).passCount).toBe(4);
  });

  it('sums up the set: nodes it moved, the next tree node, the title the app computes', () => {
    const { summary, cards } = set();
    const lastTopic = Math.max(...topics.map((topic) => TREE_NODES.indexOf(topic)));
    const seconds = cards.reduce((sum, card) => sum + card.estSeconds, 0);

    expect(summary.moved).toHaveLength(3);
    summary.moved.forEach(([name, from, to]) => {
      expect(nodesOf(set())).toContain(name);
      expect([from >= 0, from < to, to <= 1]).toEqual([true, true, true]);
    });
    expect(Number.isInteger(summary.progressDelta) && summary.progressDelta > 0).toBe(true);
    expect(summary.progressDelta).toBeLessThanOrEqual(5);
    expect(summary.tomorrow).toBe(TREE_NODES[lastTopic + 1]);
    expect(summary.reminder).toBe(fixture.summary.reminder);
    expect(summary.title).toBe(summaryTitle(cards.length, seconds));
  });
});

// Every set is served on the one topic day (the topic's `day`, 4), so a node an earlier set taught
// was last seen today: its review card shows "Seen today".
describe('review cards of sets 2 to 4', () => {
  it.each(NEW_SETS)(
    'set $setNumber reviews a node an earlier set taught today, as seen 0 days ago',
    ({ setNumber }) => {
      const review = cardOf(setAt(setNumber), 'review');

      expect(touchedBefore(setNumber)).toContain(review.node);
      expect(review.lastSeenDays).toBe(0);
    },
  );
});

describe('all four demo sets', () => {
  const allCards = () => sets.flatMap((set) => set.cards);

  it('mark bold only in the prose fields', () => {
    const marked = allCards().flatMap((card) =>
      Object.entries(card)
        .filter(([key]) => !PROSE_FIELDS.has(key))
        .flatMap(([, value]) => stringsIn(value))
        .filter((text) => text.includes('**')),
    );

    expect(sets).toHaveLength(4);
    expect(marked).toEqual([]);
  });

  // The code coloring reads `//` as the start of a comment, even inside a string. The only
  // comments in the content must be the concept cards' snippetComments, whole.
  it('have no comment in their code but the concept snippetComments', () => {
    const comments = allCards()
      .flatMap(codeOf)
      .flatMap(tokenizeCode)
      .filter((token) => token.kind === 'comment')
      .map((token) => token.text);

    expect(comments).toEqual(sets.map((set) => cardOf(set, 'concept').snippetComment));
  });

  it('keep every code field and solution within the graded length', () => {
    const code = [...allCards().flatMap(codeOf), ...solutions.exercise, ...solutions.checkpoint];

    expect(code.filter((text) => text.length > MAX_CODE_LENGTH)).toEqual([]);
  });

  it('play only samples from the default sample map', () => {
    const code = [...allCards().flatMap(codeOf), ...solutions.exercise, ...solutions.checkpoint];
    const names = new Set(code.flatMap(samplesIn));

    expect([...names].filter((name) => !SAMPLE_NAMES.includes(name))).toEqual([]);
    expect(names.size).toBeGreaterThan(0);
  });

  it('grade with rubric patterns that stay fast on input built to backtrack', () => {
    const patterns = sets.flatMap((set) => cardOf(set, 'checkpoint').rubric.map((r) => r.regex));
    const slow = patterns.filter((pattern) => patternSpeedMs(pattern) >= SPEED_LIMIT_MS);

    expect(patterns).toHaveLength(16);
    expect(slow).toEqual([]);
  });

  it('move the correct option around across sets 2 to 4', () => {
    const positions = sets
      .slice(1)
      .flatMap((set) => [cardOf(set, 'quiz').correct, cardOf(set, 'predict').correct]);

    expect(new Set(positions).size).toBeGreaterThanOrEqual(3);
  });

  it('keep the stated solutions out of the bundled fixture', () => {
    const bundled = JSON.stringify(extra);
    // Set 1's are left out: its checkpoint starter already scores 4, so its solution is its starter.
    const stated = [...solutions.exercise.slice(1), ...solutions.checkpoint.slice(1)];
    const leaked = stated.filter((code) => bundled.includes(JSON.stringify(code).slice(1, -1)));

    expect(leaked).toEqual([]);
  });
});
