// A served card's place in a split pair (M10 plan T, T9): `sequence` is `{ index, of }`, left out
// of a card outside a pair (the server never sends null). A card parses with it and without it; an
// `index` under 1 or an `of` under 2 fails the card.
import fixture from '../__fixtures__/cards.fixture.json';
import { cardSchema } from '../schema';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const [concept] = fixture.cards;

describe('a card in a sequence', () => {
  it('keeps its place in the pair', () => {
    const parsed = cardSchema.parse({ ...concept, sequence: { index: 2, of: 2 } });

    expect(parsed.sequence).toStrictEqual({ index: 2, of: 2 });
  });

  it('parses a card without one to a card without one', () => {
    expect(cardSchema.parse(concept)).not.toHaveProperty('sequence');
  });

  it.each([
    ['an index of 0', { index: 0, of: 2 }],
    ['an of of 1', { index: 1, of: 1 }],
    ['a null', null],
  ])('rejects %s', (_name, sequence) => {
    expect(cardSchema.safeParse({ ...concept, sequence }).success).toBe(false);
  });
});
