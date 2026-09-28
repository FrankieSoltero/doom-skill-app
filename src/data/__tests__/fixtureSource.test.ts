import extra from '../__fixtures__/cards.extra.fixture.json';
import fixture from '../__fixtures__/cards.fixture.json';
import { createFixtureSource } from '../fixtureSource';
import { cardSource, type CardSource, type FeedSet } from '../index';

const FIXTURE_PATH = '../__fixtures__/cards.fixture.json';
const EXTRA_PATH = '../__fixtures__/cards.extra.fixture.json';
/** The cards of each demo set in serving order: set 1 from the design fixture, then 2 to 4. */
const DEMO_CARDS = [fixture.cards, ...extra.sets.map((set) => set.cards)];
const LOOP_CALLS = 50;

/** The sets from `count` calls to one new source, made one after another. */
async function serve(count: number): Promise<(FeedSet | null)[]> {
  const source = createFixtureSource();
  const sets: (FeedSet | null)[] = [];
  for (let call = 0; call < count; call += 1) {
    sets.push(await source.getNextSet());
  }
  return sets;
}

/**
 * A fixture source reading `content` in place of the fixture at `path` (the design fixture unless
 * given). The module registry is reset first, so FeedLoadError must come from the same fresh
 * registry for `instanceof` to hold.
 */
function sourceOver(content: unknown, path = FIXTURE_PATH) {
  jest.resetModules();
  jest.doMock(path, () => content);
  const fresh = jest.requireActual<typeof import('../fixtureSource')>('../fixtureSource');
  const { FeedLoadError } = jest.requireActual<typeof import('../source')>('../source');
  return { source: fresh.createFixtureSource(), FeedLoadError };
}

afterEach(() => {
  jest.dontMock(FIXTURE_PATH);
  jest.dontMock(EXTRA_PATH);
});

describe('createFixtureSource', () => {
  it('serves the fixture as set 1 with its six cards in fixture order', async () => {
    const set = await createFixtureSource().getNextSet();

    expect(set?.setNumber).toBe(1);
    expect(set?.topic).toEqual(fixture.topic);
    expect(set?.cards).toHaveLength(6);
    expect(set?.cards).toEqual(fixture.cards);
  });

  it('serves sets 1, 2, 3 and 4, then set 1 cards again as set 5, all with the one topic', async () => {
    const sets = await serve(5);

    expect(sets.map((set) => set?.setNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(sets.map((set) => set?.cards)).toEqual([...DEMO_CARDS, fixture.cards]);
    expect(sets.map((set) => set?.summary)).toEqual([
      fixture.summary,
      ...extra.sets.map((set) => set.summary),
      fixture.summary,
    ]);
    sets.forEach((set) => {
      expect(set?.topic).toEqual(fixture.topic);
    });
  });

  it('never resolves to null: set numbers count up while the cards cycle every four', async () => {
    const sets = await serve(LOOP_CALLS);

    expect(sets.map((set) => set?.setNumber)).toEqual(
      Array.from({ length: LOOP_CALLS }, (_, call) => call + 1),
    );
    sets.forEach((set, call) => {
      expect(set?.cards).toEqual(DEMO_CARDS[call % DEMO_CARDS.length]);
    });
  });

  it('returns new objects on every call, so no two served sets share a reference', async () => {
    const [first, , , , fifth] = await serve(5);

    expect(fifth?.cards).toEqual(first?.cards);
    expect(fifth).not.toBe(first);
    expect(fifth?.topic).not.toBe(first?.topic);
    expect(fifth?.summary).not.toBe(first?.summary);
    expect(fifth?.cards).not.toBe(first?.cards);
    fifth?.cards.forEach((card, at) => {
      expect(card).not.toBe(first?.cards[at]);
    });
  });

  it('keeps a separate position for each source', async () => {
    const first = createFixtureSource();
    const second = createFixtureSource();
    await first.getNextSet();

    await expect(second.getNextSet()).resolves.toMatchObject({ setNumber: 1 });
    await expect(first.getNextSet()).resolves.toMatchObject({ setNumber: 2 });
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

describe('createFixtureSource position', () => {
  it('serves the same set on a retry after a failed parse, then goes on', async () => {
    const good = fixture.cards[1];
    const cards: unknown[] = fixture.cards.map((card, at) =>
      at === 1 ? { ...card, correct: '1' } : card,
    );
    const { source, FeedLoadError } = sourceOver({ ...fixture, cards });
    await expect(source.getNextSet()).rejects.toBeInstanceOf(FeedLoadError);

    // The source reads the fixture's cards array in place, so repairing it fixes the next parse.
    cards[1] = good;

    await expect(source.getNextSet()).resolves.toMatchObject({
      setNumber: 1,
      cards: fixture.cards,
    });
    await expect(source.getNextSet()).resolves.toMatchObject({ setNumber: 2 });
  });

  it('numbers calls made together one after another', async () => {
    const source = createFixtureSource();

    const sets = await Promise.all([source.getNextSet(), source.getNextSet()]);

    expect(sets.map((set) => set?.setNumber)).toEqual([1, 2]);
  });
});

// The source takes only `cards` and `summary` from an extra set; the rest is its own.
describe('createFixtureSource over an extra set with stray keys', () => {
  it('serves an extra set with the counted number and shared topic, whatever keys it carries', async () => {
    const [second] = extra.sets;
    const stray = { ...second, setNumber: 99, topic: { ...fixture.topic, title: 'Stray topic' } };
    const { source } = sourceOver({ sets: [stray] }, EXTRA_PATH);
    await source.getNextSet();
    const served = await source.getNextSet();

    expect(served?.setNumber).toBe(2);
    expect(served?.topic).toEqual(fixture.topic);
    expect(served?.cards).toEqual(second?.cards);
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
