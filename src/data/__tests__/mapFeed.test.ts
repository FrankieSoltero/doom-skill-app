// A concept card of a topic without Strudel (card_gen_v3, M6 hardening Task 8) is served with
// `cycles: []` and `snippet_comment: ""`. The mapper leaves the empty list out, so the schema reads
// the card as one with no cycles and the card draws no tiles (ConceptCard.plain.test.tsx).
import demo from '../__fixtures__/cards.fixture.json';
import response from '../__fixtures__/feed_response.json';
import { mapFeed } from '../mapFeed';
import { apiSetSchema, cardSchema, feedSetSchema } from '../schema';

const served = response.cards.find((card) => card.type === 'concept');

describe('mapFeed on a concept card with no cycles', () => {
  it('leaves out an empty cycles list and keeps the empty comment', () => {
    expect(
      mapFeed({ cards: [{ type: 'concept', snippet_comment: '', cycles: [] }] }),
    ).toStrictEqual({ cards: [{ type: 'concept', snippetComment: '' }] });
  });

  it('keeps a list with cycles, and an empty list on any other card type', () => {
    const cards = [
      { type: 'concept', cycles: ['c3'] },
      { type: 'review', cycles: [] },
    ];

    expect(mapFeed({ cards })).toStrictEqual({ cards });
  });

  it('gives a set whose served concept card has no cycles and no tiles to draw', () => {
    const plain = { ...served, snippet: 'SELECT rank() OVER w FROM t;', snippet_comment: '' };
    const set = feedSetSchema.parse(mapFeed({ ...response, cards: [{ ...plain, cycles: [] }] }));

    expect(set.cards).toHaveLength(1);
    expect(set.cards[0]).not.toHaveProperty('cycles');
    expect(set.cards[0]).toMatchObject({ type: 'concept', snippetComment: '' });
  });
});

describe("mapFeed on the set's topic", () => {
  it('keeps the language the API sends, as the app reads it', () => {
    const set = apiSetSchema.parse(mapFeed(response));

    expect(response.topic.lang).toBe('strudel');
    expect(set.topic.lang).toBe('strudel');
    expect(set.topic).toMatchObject({ slug: 'strudel', horizonDays: 14 });
  });
});

describe('mapFeed on a card with sources', () => {
  it('keeps each source, its URL and a null licence as sent, and an empty list', () => {
    const sources = [
      { title: 'Snake_case title', url: 'https://a.test/x_y?q_r=1', license: 'CC BY-SA 4.0' },
      { title: 'Tempo', url: 'https://b.test/', license: null },
    ];
    const cards = [
      { type: 'quiz', sources },
      { type: 'checkpoint', sources: [] },
    ];

    expect(mapFeed({ cards })).toStrictEqual({ cards });
  });

  it('gives the served cards their sources, and the checkpoint none', () => {
    const set = feedSetSchema.parse(mapFeed(response));
    const sent = response.cards.map((card) => card.sources);

    expect(set.cards.map((card) => card.sources)).toStrictEqual(sent);
    expect(sent.some((sources) => sources.length > 0)).toBe(true);
  });
});

// Offline-topic plan Task 2 (A3): every card carries what answering it right pays, and a concept
// card what seeing it pays; the schema requires both.
const POINTS = { concept: 0, quiz: 5, predict: 5, exercise: 8, review: 3, checkpoint: 50 };

/** Each card as `[type, points, seenPoints]`, `seenPoints` undefined when the card has none. */
function pointsOf(cards: readonly object[]): unknown[] {
  return cards.map((card) => [
    'type' in card ? card.type : undefined,
    'points' in card ? card.points : undefined,
    'seenPoints' in card ? card.seenPoints : undefined,
  ]);
}

describe('points on every card', () => {
  it('gives each served card its points, and a concept card its seen points', () => {
    const set = apiSetSchema.parse(mapFeed(response));

    expect(pointsOf(set.cards)).toEqual(
      response.cards.map((card) => [
        card.type,
        POINTS[card.type as keyof typeof POINTS],
        card.type === 'concept' ? 2 : undefined,
      ]),
    );
  });

  it("gives every demo card its kind's points", () => {
    const set = feedSetSchema.parse({ ...demo, setNumber: 1 });

    expect(pointsOf(set.cards)).toEqual(
      demo.cards.map((card) => [
        card.type,
        POINTS[card.type as keyof typeof POINTS],
        card.type === 'concept' ? 2 : undefined,
      ]),
    );
  });

  it('refuses a card without points, and a concept card without seen points', () => {
    const [concept, quiz]: Record<string, unknown>[] = demo.cards.map((card) => ({ ...card }));
    delete quiz?.points;
    delete concept?.seenPoints;

    expect(() => cardSchema.parse(quiz)).toThrow(/points/);
    expect(() => cardSchema.parse(concept)).toThrow(/seenPoints/);
  });
});
