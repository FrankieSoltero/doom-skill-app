// A card's sources (M6 hardening Task 12): at most 3, each a title, an `https` URL and a licence
// or null. The bundled demo cards have none. A source with any other URL fails its card, which
// the set then drops as it drops any card from the API that fails its schema.
import { logWarning } from '../../log';
import fixture from '../__fixtures__/cards.fixture.json';
import { cardSchema, feedSetSchema } from '../schema';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const ID = '00000000-0000-4000-8000-000000000001';
const [concept] = fixture.cards;
const SOURCE = { title: 'Mini-notation', url: 'https://strudel.cc/learn/', license: 'MIT' };

function withSources(sources: unknown) {
  return { ...concept, id: ID, sources };
}

describe('a card with sources', () => {
  it('keeps each source as sent, a null licence included', () => {
    const sources = [SOURCE, { ...SOURCE, url: 'https://en.wikipedia.org/wiki/X', license: null }];

    expect(cardSchema.parse(withSources(sources))).toMatchObject({ sources });
  });

  it('parses a demo card, which has no sources, without any', () => {
    expect(cardSchema.parse(concept)).not.toHaveProperty('sources');
    expect(
      feedSetSchema
        .parse({ ...fixture, setNumber: 1 })
        .cards.every((card) => card.sources === undefined),
    ).toBe(true);
  });

  it.each([
    ['an http URL', 'http://strudel.cc/learn/'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an https URL in capitals', 'HTTPS://strudel.cc/'],
    ['a URL with a space', 'https://strudel.cc/a b'],
    ['no host', 'https://'],
  ])('rejects a source with %s', (_name, url) => {
    expect(cardSchema.safeParse(withSources([{ ...SOURCE, url }])).success).toBe(false);
  });

  it('rejects more than 3 sources and a source without a title', () => {
    expect(cardSchema.safeParse(withSources([SOURCE, SOURCE, SOURCE])).success).toBe(true);
    expect(cardSchema.safeParse(withSources([SOURCE, SOURCE, SOURCE, SOURCE])).success).toBe(false);
    expect(cardSchema.safeParse(withSources([{ ...SOURCE, title: '' }])).success).toBe(false);
  });

  it('drops a card from the API whose source is not https, logged by its path only', () => {
    const bad = withSources([{ ...SOURCE, url: 'javascript:alert(1)' }]);

    const set = feedSetSchema.parse({ ...fixture, setNumber: 1, cards: [bad, concept] });

    expect(set.droppedIds).toStrictEqual([ID]);
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['card_invalid', { paths: 'sources.0.url' }],
    ]);
  });
});
