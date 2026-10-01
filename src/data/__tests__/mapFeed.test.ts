// A concept card of a topic without Strudel (card_gen_v3, M6 hardening Task 8) is served with
// `cycles: []` and `snippet_comment: ""`. The mapper leaves the empty list out, so the schema reads
// the card as one with no cycles and the card draws no tiles (ConceptCard.plain.test.tsx).
import response from '../__fixtures__/feed_response.json';
import { mapFeed } from '../mapFeed';
import { feedSetSchema } from '../schema';

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
