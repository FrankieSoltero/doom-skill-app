// The count of review ratings made on this phone (`ratingsMade`, src/feed/store.ts): it rises by
// one with each review rating stored, and it is kept in async storage under `feedState` as
// `{"ratingsMade": n}`, so it survives an app restart.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { logWarning } from '../../log';
import { loadFeedState, useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const KEY = 'feedState';
const store = () => useFeedStore.getState();

/** Starts as a freshly opened app would: `stored` in storage (or nothing), then the read. */
async function openWith(stored: string | null) {
  await AsyncStorage.clear();
  if (stored !== null) await AsyncStorage.setItem(KEY, stored);
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  await loadFeedState();
}

/** Lets the storage writes started by the store finish. */
async function settle() {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
}

beforeEach(async () => {
  jest.mocked(logWarning).mockClear();
  await AsyncStorage.clear();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('counting review ratings', () => {
  it('starts at 0', () => {
    expect(store().ratingsMade).toBe(0);
  });

  it('rises by one for each review rating stored, not for a reveal', () => {
    store().setAnswer(0, { kind: 'review', revealed: true, rating: null });
    expect(store().ratingsMade).toBe(0);

    store().setAnswer(0, { kind: 'review', revealed: true, rating: 2 });
    store().setAnswer(1, { kind: 'review', revealed: true, rating: 0 });

    expect(store().ratingsMade).toBe(2);
  });

  it('counts a rated card once, and no answer of another kind', () => {
    store().setAnswer(0, { kind: 'review', revealed: true, rating: 1 });
    store().setAnswer(0, { kind: 'review', revealed: true, rating: 3 });
    store().setAnswer(1, { kind: 'choice', picked: 0 });

    expect(store().ratingsMade).toBe(1);
  });

  it('counts the same in a set the API served and in a demo set', () => {
    store().startSet(makeSet(1, [cardsByType.review]));
    store().setAnswer(0, { kind: 'review', revealed: true, rating: 2 });

    expect(store().ratingsMade).toBe(1);
  });

  it('keeps the count across a reset (a sign-out, another topic) and a new set', () => {
    store().setAnswer(0, { kind: 'review', revealed: true, rating: 2 });

    store().reset();
    store().startSet(makeSet(1, [cardsByType.review]));

    expect(store().ratingsMade).toBe(1);
  });
});

describe('keeping the count', () => {
  it('stores each new count, and a restarted app reads it back', async () => {
    store().setAnswer(0, { kind: 'review', revealed: true, rating: 2 });
    store().setAnswer(1, { kind: 'review', revealed: true, rating: 3 });
    await settle();

    expect(await AsyncStorage.getItem(KEY)).toBe(JSON.stringify({ ratingsMade: 2 }));
    useFeedStore.setState(useFeedStore.getInitialState(), true);
    await loadFeedState();
    expect(store().ratingsMade).toBe(2);
  });

  it('reads nothing stored (a first launch) as 0', async () => {
    await openWith(null);

    expect(store().ratingsMade).toBe(0);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('reads a state stored without ratingsMade (an older app) as 0', async () => {
    await openWith(JSON.stringify({}));

    expect(store().ratingsMade).toBe(0);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', '{oops'],
    ['a value of the wrong shape', JSON.stringify([3])],
    ['a negative count', JSON.stringify({ ratingsMade: -1 })],
    ['a count that is not whole', JSON.stringify({ ratingsMade: 1.5 })],
    ['a count that is text', JSON.stringify({ ratingsMade: '3' })],
  ])('reads %s as 0, and logs it', async (_name, value) => {
    await openWith(value);

    expect(store().ratingsMade).toBe(0);
    expect(logWarning).toHaveBeenCalledWith('feed_state_invalid', {});
  });

  it('reads a failed storage read as 0, and logs its kind', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await openWith(JSON.stringify({ ratingsMade: 5 }));

    expect(store().ratingsMade).toBe(0);
    expect(logWarning).toHaveBeenCalledWith('feed_state_read_failed', { kind: 'Error' });
  });

  it('keeps counting when a write fails, and logs its kind', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('full'));

    store().setAnswer(0, { kind: 'review', revealed: true, rating: 0 });
    await settle();

    expect(store().ratingsMade).toBe(1);
    expect(logWarning).toHaveBeenCalledWith('feed_state_write_failed', { kind: 'Error' });
  });

  it('does not lower a count made before the stored one was read', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ratingsMade: 1 }));
    useFeedStore.setState({ ratingsMade: 4 });

    await loadFeedState();

    expect(store().ratingsMade).toBe(4);
  });
});
