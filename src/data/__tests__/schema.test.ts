import { logWarning } from '../../log';
import { cardTheme, type CardType } from '../../theme';
import fixture from '../__fixtures__/cards.fixture.json';
// The types come through the public entry, as the rest of the app imports them.
import type {
  Card,
  CheckpointCard,
  ClozeCard,
  ConceptCard,
  ExerciseCard,
  FeedSet,
  PredictCard,
  QuizCard,
  ReviewCard,
  ScenarioCard,
  Summary,
  Topic,
} from '../index';
import { apiSetSchema, cardSchema, feedSetSchema, summarySchema, topicSchema } from '../schema';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

// True only when A and B are each assignable to the other. The consts below are typed with it,
// so `pnpm typecheck` fails as soon as a schema and the type it must agree with drift apart.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type NamedCards = {
  concept: ConceptCard;
  quiz: QuizCard;
  predict: PredictCard;
  cloze: ClozeCard;
  scenario: ScenarioCard;
  exercise: ExerciseCard;
  review: ReviewCard;
  checkpoint: CheckpointCard;
};

const cardTypesMatchTheme: Equal<Card['type'] | 'summary', CardType> = true;
const namedCardsCoverTheUnion: Equal<NamedCards[keyof NamedCards], Card> = true;
const namedCardsMatchTheirType: Equal<
  { [K in keyof NamedCards]: NamedCards[K]['type'] },
  { [K in keyof NamedCards]: K }
> = true;
const feedSetHasThePlannedShape: Equal<
  FeedSet,
  { topic: Topic; setNumber: number; cards: Card[]; summary: Summary }
> = true;

const FIXTURE_CARD_TYPES = ['concept', 'quiz', 'predict', 'exercise', 'review', 'checkpoint'];
const QUIZ_INDEX = 1;
const PREDICT_INDEX = 2;

/** The fixture as a source hands it to the schema, with the cards swapped when given. */
function feedSetInput(cards: readonly unknown[] = fixture.cards): Record<string, unknown> {
  return { ...fixture, setNumber: 1, cards };
}

/** The fixture's cards with the card at `index` shallow-patched. */
function patchCard(index: number, patch: Record<string, unknown>): unknown[] {
  return fixture.cards.map((card, at) => (at === index ? { ...card, ...patch } : card));
}

/** The dotted path of every issue the schema reports; empty when the input parses. */
function issuePaths(input: unknown): string[] {
  const result = feedSetSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('card type agreement', () => {
  it('holds at compile time between the schema, the named card types and the theme', () => {
    expect([
      cardTypesMatchTheme,
      namedCardsCoverTheUnion,
      namedCardsMatchTheirType,
      feedSetHasThePlannedShape,
    ]).toEqual([true, true, true, true]);
  });

  it('gives the theme a card color for every card type the schema accepts, plus summary', () => {
    const schemaTypes = cardSchema.options.map((option) => option.shape.type.value);

    expect([...schemaTypes, 'summary'].sort()).toEqual(Object.keys(cardTheme).sort());
  });
});

describe('feedSetSchema', () => {
  it('parses the fixture into a set with its six cards in fixture order', () => {
    const set = feedSetSchema.parse(feedSetInput());

    expect(set.setNumber).toBe(1);
    expect(set.topic).toEqual(fixture.topic);
    expect(set.summary).toEqual(fixture.summary);
    expect(set.cards.map((card) => card.type)).toEqual(FIXTURE_CARD_TYPES);
    expect(set.cards).toEqual(fixture.cards);
  });

  it('ignores keys it does not know, such as the fixture tree', () => {
    const set = feedSetSchema.parse(feedSetInput());

    expect(Object.keys(set).sort()).toEqual(['cards', 'setNumber', 'summary', 'topic']);
  });

  it("keeps the API's feed date, and refuses one that is not a YYYY-MM-DD date", () => {
    expect(feedSetSchema.parse({ ...feedSetInput(), feedDate: '2026-10-01' }).feedDate).toBe(
      '2026-10-01',
    );
    expect(issuePaths({ ...feedSetInput(), feedDate: '1 October' })).toEqual(['feedDate']);
  });

  it('rejects a quiz whose correct index is a string, naming the field path', () => {
    expect(issuePaths(feedSetInput(patchCard(QUIZ_INDEX, { correct: '1' })))).toEqual([
      'cards.1.correct',
    ]);
  });

  it('rejects a card with no title, naming the field path', () => {
    const [concept, ...rest] = fixture.cards;
    const untitled = Object.fromEntries(
      Object.entries({ ...concept }).filter(([k]) => k !== 'title'),
    );

    expect(issuePaths(feedSetInput([untitled, ...rest]))).toEqual(['cards.0.title']);
  });

  it('drops a card of an unknown type and keeps the rest in order', () => {
    const cards = [...fixture.cards.slice(0, 2), { type: 'video', title: 'Clip' }];
    const set = feedSetSchema.parse(feedSetInput([...cards, ...fixture.cards.slice(2)]));

    expect(set.cards.map((card) => card.type)).toEqual(FIXTURE_CARD_TYPES);
  });

  it('reports a bad card by its original index when an earlier card was dropped', () => {
    const cards = [{ type: 'video' }, ...patchCard(QUIZ_INDEX, { correct: '1' })];

    expect(issuePaths(feedSetInput(cards))).toEqual(['cards.2.correct']);
  });

  it('rejects a card that has no type rather than dropping it', () => {
    expect(issuePaths(feedSetInput([{ title: 'No type' }]))).toEqual(['cards.0.type']);
  });

  it.each([4, -1, 1.5])('rejects a quiz whose correct index is %p', (correct) => {
    expect(issuePaths(feedSetInput(patchCard(QUIZ_INDEX, { correct })))).toEqual([
      'cards.1.correct',
    ]);
  });

  it('rejects a predict card whose correct index is past its options', () => {
    expect(issuePaths(feedSetInput(patchCard(PREDICT_INDEX, { correct: 4 })))).toEqual([
      'cards.2.correct',
    ]);
  });

  it('rejects a set number below 1', () => {
    expect(issuePaths({ ...feedSetInput(), setNumber: 0 })).toEqual(['setNumber']);
  });
});

describe('feedSetSchema: conditions for cards from a server', () => {
  const ID = '00000000-0000-4000-8000-000000000302';
  const CHECKPOINT_INDEX = fixture.cards.findIndex((card) => card.type === 'checkpoint');
  const EXERCISE_INDEX = fixture.cards.findIndex((card) => card.type === 'exercise');
  const checkpoint = fixture.cards[CHECKPOINT_INDEX];
  const rubricSize =
    checkpoint !== undefined && 'rubric' in checkpoint ? checkpoint.rubric.length : 0;

  beforeEach(() => {
    jest.mocked(logWarning).mockClear();
  });

  it('keeps an id on every card type', () => {
    const cards = fixture.cards.map((card) => ({ ...card, id: ID }));
    const set = feedSetSchema.parse(feedSetInput(cards));

    expect(set.cards.map((card) => card.id)).toEqual(fixture.cards.map(() => ID));
  });

  it('parses a card with no id, as the fixture has none', () => {
    const set = feedSetSchema.parse(feedSetInput());

    expect(set.cards.every((card) => !('id' in card))).toBe(true);
  });

  it.each(['', 'card-1', `${ID}x`, ID.replaceAll('-', '')])('rejects the id %p', (id) => {
    expect(issuePaths(feedSetInput(patchCard(QUIZ_INDEX, { id })))).toEqual(['cards.1.id']);
  });

  it('refuses a checkpoint whose threshold is above its rubric size', () => {
    const patched = patchCard(CHECKPOINT_INDEX, { passThreshold: rubricSize + 1 });

    expect(issuePaths(feedSetInput(patched))).toEqual([
      `cards.${String(CHECKPOINT_INDEX)}.passThreshold`,
    ]);
  });

  it('accepts a checkpoint whose threshold equals its rubric size', () => {
    const patched = patchCard(CHECKPOINT_INDEX, { passThreshold: rubricSize });

    expect(issuePaths(feedSetInput(patched))).toEqual([]);
  });

  it('drops an exercise in another language as an unknown kind, keeps the rest and logs it', () => {
    const set = feedSetSchema.parse(feedSetInput(patchCard(EXERCISE_INDEX, { lang: 'cobol' })));

    expect(set.cards.map((card) => card.type)).toEqual(
      FIXTURE_CARD_TYPES.filter((type) => type !== 'exercise'),
    );
    expect(jest.mocked(logWarning).mock.calls).toEqual([['exercise_lang_unknown']]);
  });
});

describe('cloze and scenario cards (M9 plan C)', () => {
  const card = (n: number) => ({
    id: `00000000-0000-4000-8000-00000000040${String(n)}`,
    sources: [
      {
        title: 'Photosynthesis',
        url: 'https://en.wikipedia.org/wiki/Photosynthesis',
        license: 'CC BY-SA 4.0',
      },
    ],
    node: 'Photosynthesis',
    estSeconds: 30,
    title: 'Fill in the blank',
    options: ['chemical', 'thermal', 'nuclear'],
    correct: 2,
    explanation: 'Stored in **glucose**.',
  });
  const CLOZE = { ...card(1), type: 'cloze', text: 'Plants turn light into ___ energy.' };
  const SCENARIO = { ...card(2), type: 'scenario', situation: 'A plant sits in the dark.' };

  it('parses a set from the API holding both, after the fixture cards, as sent', () => {
    const input = { ...feedSetInput([...fixture.cards, CLOZE, SCENARIO]), feedDate: '2026-10-02' };
    const set = apiSetSchema.parse(input);

    expect(set.cards.map((item) => item.type)).toEqual([
      ...FIXTURE_CARD_TYPES,
      'cloze',
      'scenario',
    ]);
    expect(set.cards.slice(-2)).toEqual([CLOZE, SCENARIO]);
  });

  it.each([CLOZE, SCENARIO])(
    'refuses a $type card whose correct index is past its options',
    (item) => {
      const result = cardSchema.safeParse({ ...item, correct: 3 });

      expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['correct']);
    },
  );

  it.each([CLOZE, SCENARIO])('refuses a $type card with one option', (item) => {
    const result = cardSchema.safeParse({ ...item, options: ['chemical'], correct: 0 });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['options']);
  });

  it('refuses a cloze with no text and a scenario with no situation', () => {
    const paths = [
      cardSchema.safeParse({ ...CLOZE, text: '' }),
      cardSchema.safeParse({ ...SCENARIO, situation: undefined }),
    ].map((result) => result.error?.issues.map((issue) => issue.path.join('.')));

    expect(paths).toEqual([['text'], ['situation']]);
  });
});

describe('snippetStyle on concept and review cards (M9 plan C)', () => {
  const quotable = fixture.cards.filter((card) => ['concept', 'review'].includes(card.type));

  it('keeps a quoted style on a concept and a review', () => {
    const parsed = quotable.map((card) => cardSchema.parse({ ...card, snippetStyle: 'quote' }));

    expect(parsed.map((card) => [card.type, 'snippetStyle' in card && card.snippetStyle])).toEqual([
      ['concept', 'quote'],
      ['review', 'quote'],
    ]);
  });

  it('parses a concept and a review without the field, leaving it absent', () => {
    const parsed = quotable.map((card) => cardSchema.parse(card));

    expect(parsed.map((card) => [card.type, 'snippetStyle' in card])).toEqual([
      ['concept', false],
      ['review', false],
    ]);
  });
});

describe('part schemas', () => {
  it('parse the fixture topic and summary unchanged', () => {
    expect(topicSchema.parse(fixture.topic)).toEqual(fixture.topic);
    expect(summarySchema.parse(fixture.summary)).toEqual(fixture.summary);
  });

  it('reject topic progress outside 0 to 1', () => {
    const result = topicSchema.safeParse({ ...fixture.topic, progress: 1.5 });

    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['progress']);
  });

  it('parse every fixture card on its own', () => {
    expect(fixture.cards.map((card) => cardSchema.parse(card))).toEqual(fixture.cards);
  });
});
