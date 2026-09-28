import fixture from '../__fixtures__/cards.fixture.json';
import { createFixtureSource } from '../fixtureSource';
import { cardSource, type CardSource } from '../index';

const FIXTURE_PATH = '../__fixtures__/cards.fixture.json';

/**
 * A fixture source reading `content` in place of the real fixture. The module registry is reset
 * first, so FeedLoadError must come from the same fresh registry for `instanceof` to hold.
 */
function sourceOver(content: unknown) {
  jest.resetModules();
  jest.doMock(FIXTURE_PATH, () => content);
  const fresh = jest.requireActual<typeof import('../fixtureSource')>('../fixtureSource');
  const { FeedLoadError } = jest.requireActual<typeof import('../source')>('../source');
  return { source: fresh.createFixtureSource(), FeedLoadError };
}

afterEach(() => {
  jest.dontMock(FIXTURE_PATH);
});

describe('createFixtureSource', () => {
  it('serves the fixture as set 1 with its six cards in fixture order', async () => {
    const set = await createFixtureSource().getNextSet();

    expect(set?.setNumber).toBe(1);
    expect(set?.topic).toEqual(fixture.topic);
    expect(set?.cards).toHaveLength(6);
    expect(set?.cards).toEqual(fixture.cards);
  });

  it('resolves to null once the fixture set has been served', async () => {
    const source = createFixtureSource();
    await source.getNextSet();

    await expect(source.getNextSet()).resolves.toBeNull();
  });

  it('keeps a separate position for each source', async () => {
    const first = createFixtureSource();
    const second = createFixtureSource();
    await first.getNextSet();

    await expect(second.getNextSet()).resolves.toMatchObject({ setNumber: 1 });
    await expect(first.getNextSet()).resolves.toBeNull();
  });

  it('rejects with FeedLoadError naming the path of a wrongly typed field', async () => {
    const cards = fixture.cards.map((card, at) => (at === 1 ? { ...card, correct: '1' } : card));
    const { source, FeedLoadError } = sourceOver({ ...fixture, cards });
    const loading = source.getNextSet();

    await expect(loading).rejects.toBeInstanceOf(FeedLoadError);
    await expect(loading).rejects.toThrow('cards.1.correct');
  });

  it('rejects with FeedLoadError naming the path of a missing field', async () => {
    const untitled = Object.fromEntries(
      Object.entries({ ...fixture.cards[5] }).filter(([key]) => key !== 'title'),
    );
    const { source, FeedLoadError } = sourceOver({
      ...fixture,
      cards: [...fixture.cards.slice(0, 5), untitled],
    });
    const loading = source.getNextSet();

    await expect(loading).rejects.toBeInstanceOf(FeedLoadError);
    await expect(loading).rejects.toThrow('cards.5.title');
  });

  it('drops a card of an unknown type and serves the rest', async () => {
    const cards = [{ type: 'video', title: 'Clip' }, ...fixture.cards];
    const { source } = sourceOver({ ...fixture, cards });

    await expect(source.getNextSet()).resolves.toMatchObject({ cards: fixture.cards });
  });
});

describe('cardSource', () => {
  it('is the one app-wide source, serving the fixture set first', async () => {
    const source: CardSource = cardSource;

    await expect(source.getNextSet()).resolves.toMatchObject({
      setNumber: 1,
      cards: fixture.cards,
    });
  });
});
