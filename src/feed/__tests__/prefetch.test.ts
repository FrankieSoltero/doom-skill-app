// The kept sets (src/feed/prefetch.ts) when an `ahead` answer settles late: after a later set was
// served, after a sign-out, and beside another topic's request; and an answer marked in one of two
// kept sets that share a number. Storage is the library's in-memory Jest mock.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { signOut, useSession } from '../../auth/useSession';
import type { FeedSet } from '../../data';
import { loadPersisted, markAnswered, savePersisted } from '../persist';
import { keepServed } from '../prefetch';
import { useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';
import { scriptedSource } from '../testing/sources';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const USER = 'user-1';

/** Set `n` of `slug` served on `date`, with one quiz whose id names the set and the date. */
function setOf(n: number, { slug = 'strudel', date = '2026-10-01' } = {}): FeedSet {
  const day = Number(date.slice(-2));
  const id = `00000000-0000-4000-8000-${String(day * 100 + n).padStart(12, '0')}`;
  const base = makeSet(0, [{ ...cardsByType.quiz, id }]);
  return { ...base, topic: { ...base.topic, slug }, setNumber: n, feedDate: date };
}

const numbers = async (slug = 'strudel') =>
  (await loadPersisted(USER, slug)).map(({ set }) => set.setNumber);

/** A source whose `ahead` answers stay pending until the test settles them, in order. */
function pendingAhead() {
  const source = scriptedSource();
  const answers: ((sets: FeedSet[]) => void)[] = [];
  source.ahead.mockImplementation(
    () =>
      new Promise((resolve) => {
        answers.push(resolve);
      }),
  );
  return { source, answers };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useSession.setState({ status: 'signedIn', userId: USER });
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('a late ahead answer', () => {
  it('keeps nothing from it when it does not hold the set served since', async () => {
    const { source, answers } = pendingAhead();
    const asked = keepServed(source, setOf(1));
    await keepServed(source, setOf(3));

    answers[0]?.([setOf(2)]);
    await asked;

    expect(await numbers()).toStrictEqual([3]);
  });

  it("writes nothing back after a sign-out: the departed user's sets stay cleared", async () => {
    const { source, answers } = pendingAhead();
    const asked = keepServed(source, setOf(1));
    await new Promise(setImmediate);
    expect(await numbers()).toStrictEqual([1]);

    await signOut();
    answers[0]?.([setOf(2), setOf(3)]);
    await asked;

    expect(await numbers()).toStrictEqual([]);
  });

  it("does not hold back another topic's request", async () => {
    const { source, answers } = pendingAhead();
    const strudel = keepServed(source, setOf(1));
    const sql = keepServed(source, setOf(1, { slug: 'sql' }));

    expect(source.ahead.mock.calls).toStrictEqual([
      ['strudel', 3],
      ['sql', 3],
    ]);
    answers.forEach((answer) => {
      answer([]);
    });
    await Promise.all([strudel, sql]);
    expect(await numbers('sql')).toStrictEqual([1]);
  });
});

describe('an answer in one of two kept sets that share a number', () => {
  it('is marked in the set that holds the card', async () => {
    const older = setOf(1, { date: '2026-10-01' });
    const newer = setOf(1, { date: '2026-10-02' });
    await savePersisted(USER, 'strudel', [
      { set: older, answered: [] },
      { set: newer, answered: [] },
    ]);
    const cardId = newer.cards[0]?.id ?? '';

    await markAnswered(USER, 'strudel', 1, cardId);

    const kept = await loadPersisted(USER, 'strudel');
    expect(kept.map(({ answered }) => answered)).toStrictEqual([[], [cardId]]);
  });
});
