// Whether the current set's cards play their Strudel code (`selectPlaysStrudel`, src/feed/store.ts):
// only a set whose topic the API names `strudel`. A set from an older API, which sends no language,
// one with none (`null`) and one in any other language do not play, nor does an empty session.
// The demo set's topic (`strudel`) is checked where card data is read (src/data, schema.test.ts).
import type { FeedSet } from '../../data';
import { selectPlaysStrudel, useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';

const store = () => useFeedStore.getState();

/** A set of one concept card whose topic is `topic`'s change of the test topic. */
function setWith(topic: Partial<FeedSet['topic']>): FeedSet {
  const set = makeSet(0, [cardsByType.concept]);
  return { ...set, topic: { ...set.topic, ...topic } };
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('selectPlaysStrudel', () => {
  it('is true for a set whose topic language is strudel', () => {
    store().startSet(setWith({ lang: 'strudel' }));

    expect(selectPlaysStrudel(store())).toBe(true);
  });

  it.each([
    ['null', { lang: null }],
    ['absent (an older API)', {}],
    ['another language', { lang: 'sql' }],
    ['another case', { lang: 'Strudel' }],
  ])('is false for a set whose topic language is %s', (_name, topic) => {
    store().startSet(setWith(topic));

    expect(selectPlaysStrudel(store())).toBe(false);
  });

  it('is false when no set is loaded', () => {
    expect(store().set).toBeNull();
    expect(selectPlaysStrudel(store())).toBe(false);
  });
});
