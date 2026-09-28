import { cardTheme, type CardType } from '../../theme';
import fixture from '../__fixtures__/cards.fixture.json';
// The types come through the public entry, as the rest of the app imports them.
import type {
  Card,
  CheckpointCard,
  ConceptCard,
  ExerciseCard,
  FeedSet,
  PredictCard,
  QuizCard,
  ReviewCard,
  Summary,
  Topic,
} from '../index';
import { cardSchema, feedSetSchema, summarySchema, topicSchema } from '../schema';

// True only when A and B are each assignable to the other. The consts below are typed with it,
// so `pnpm typecheck` fails as soon as a schema and the type it must agree with drift apart.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type NamedCards = {
  concept: ConceptCard;
  quiz: QuizCard;
  predict: PredictCard;
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
