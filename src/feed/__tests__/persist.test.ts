// The persisted feed store (src/feed/persist.ts): each user's sets per topic in async storage,
// bounded, validated on read, and cleared on sign-out beside the outbox and the query cache. The
// storage is the library's in-memory Jest mock; nothing leaves the test.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { queryClient } from '../../api/query';
import { signOut, useSession } from '../../auth/useSession';
import type { FeedSet } from '../../data';
import { createOutbox } from '../outbox';
import {
  PERSIST_SETS,
  PERSIST_TOPICS,
  PERSIST_VERSION,
  clearPersisted,
  loadPersisted,
  markAnswered,
  savePersisted,
} from '../persist';
import { attempt, offline, settle } from '../testing/outbox';
import { cardsByType, makeSet } from '../testing/sets';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const USER = 'user-1';
const OTHER = 'user-2';

/** Set `n` of the demo topic, served on 1 October, with one quiz card. */
function setOf(n: number): FeedSet {
  const card = {
    ...cardsByType.quiz,
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  };
  return { ...makeSet(0, [card]), setNumber: n, feedDate: '2026-10-01' };
}

/** Entries for sets `numbers`, none answered. */
const entries = (...numbers: number[]) => numbers.map((n) => ({ set: setOf(n), answered: [] }));

/** The keys async storage holds, sorted. */
async function keys(): Promise<string[]> {
  return [...(await AsyncStorage.getAllKeys())].sort();
}

let now = 1_000;

beforeEach(async () => {
  await AsyncStorage.clear();
  // Every write is one millisecond after the one before, so "oldest-written" is never a tie.
  jest.spyOn(Date, 'now').mockImplementation(() => (now += 1));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('constants', () => {
  it('keeps 4 sets per topic and 5 topics per user, in payload version 1', () => {
    expect([PERSIST_SETS, PERSIST_TOPICS, PERSIST_VERSION]).toStrictEqual([4, 5, 1]);
  });
});

describe('save and load', () => {
  it('loads the saved sets in order with their answered ids', async () => {
    const saved = entries(1, 2, 3, 4).map((entry, i) => ({
      ...entry,
      answered: [`a-${String(i)}`],
    }));

    await savePersisted(USER, 'strudel', saved);

    expect(await loadPersisted(USER, 'strudel')).toStrictEqual(saved);
    expect(await keys()).toStrictEqual(['feed:user-1:strudel']);
  });

  it('keeps the ids of the cards a set was served without', async () => {
    const set = { ...setOf(1), droppedIds: ['gone-1'] };

    await savePersisted(USER, 'strudel', [{ set, answered: [] }]);

    expect(await loadPersisted(USER, 'strudel')).toStrictEqual([{ set, answered: [] }]);
  });

  it('loads nothing for a topic never saved, or another user', async () => {
    await savePersisted(USER, 'strudel', entries(1));

    expect(await loadPersisted(USER, 'sql')).toStrictEqual([]);
    expect(await loadPersisted(OTHER, 'strudel')).toStrictEqual([]);
  });

  it('drops the oldest set past 4', async () => {
    await savePersisted(USER, 'strudel', entries(1, 2, 3, 4, 5));

    const loaded = await loadPersisted(USER, 'strudel');
    expect(loaded.map(({ set }) => set.setNumber)).toStrictEqual([2, 3, 4, 5]);
  });

  it('removes the oldest-written topic when a sixth is saved', async () => {
    for (const slug of ['a', 'b', 'c', 'd', 'e']) await savePersisted(USER, slug, entries(1));
    await savePersisted(OTHER, 'a', entries(1));
    await markAnswered(USER, 'a', 1, 'card-1');

    await savePersisted(USER, 'f', entries(1));

    // `a` was written last by its answer, so `b` is the oldest.
    expect(await keys()).toStrictEqual([
      'feed:user-1:a',
      'feed:user-1:c',
      'feed:user-1:d',
      'feed:user-1:e',
      'feed:user-1:f',
      'feed:user-2:a',
    ]);
  });

  it('removes an unreadable topic first when a sixth is saved', async () => {
    for (const slug of ['a', 'b', 'c', 'd']) await savePersisted(USER, slug, entries(1));
    await AsyncStorage.setItem('feed:user-1:old', '{broken');

    await savePersisted(USER, 'f', entries(1));

    expect(await keys()).not.toContain('feed:user-1:old');
    expect(await keys()).toHaveLength(PERSIST_TOPICS);
  });
});

describe('markAnswered', () => {
  it("adds the card to its set's answered ids, once, and leaves the others", async () => {
    await savePersisted(USER, 'strudel', entries(1, 2, 3));

    await markAnswered(USER, 'strudel', 2, 'card-2');
    await markAnswered(USER, 'strudel', 2, 'card-2');

    const loaded = await loadPersisted(USER, 'strudel');
    expect(loaded.map(({ answered }) => answered)).toStrictEqual([[], ['card-2'], []]);
  });

  it('keeps every answer when several are marked at once', async () => {
    await savePersisted(USER, 'strudel', entries(1));

    await Promise.all(['x', 'y', 'z'].map((id) => markAnswered(USER, 'strudel', 1, id)));

    expect((await loadPersisted(USER, 'strudel'))[0]?.answered).toStrictEqual(['x', 'y', 'z']);
  });

  it('writes nothing for a set it does not hold', async () => {
    await savePersisted(USER, 'strudel', entries(1));
    jest.mocked(AsyncStorage.setItem).mockClear();

    await markAnswered(USER, 'strudel', 9, 'card-9');
    await markAnswered(USER, 'sql', 1, 'card-1');

    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('what storage holds is untrusted', () => {
  it.each([
    ['an older version', { version: 0, writtenAt: 1, sets: entries(1) }],
    [
      'a set that fails the card schema',
      { version: 1, writtenAt: 1, sets: [{ set: {}, answered: [] }] },
    ],
    ['more than 4 sets', { version: 1, writtenAt: 1, sets: entries(1, 2, 3, 4, 5) }],
  ])('loads nothing from %s, without throwing', async (_name, payload) => {
    await AsyncStorage.setItem('feed:user-1:strudel', JSON.stringify(payload));

    await expect(loadPersisted(USER, 'strudel')).resolves.toStrictEqual([]);
  });

  it('loads nothing from text that is not JSON, or a storage that fails', async () => {
    await AsyncStorage.setItem('feed:user-1:strudel', '{broken');
    await expect(loadPersisted(USER, 'strudel')).resolves.toStrictEqual([]);

    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read'));
    await expect(loadPersisted(USER, 'sql')).resolves.toStrictEqual([]);
  });

  it('does not throw when saving fails', async () => {
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('write'));

    await expect(savePersisted(USER, 'strudel', entries(1))).resolves.toBeUndefined();
  });
});

describe('clearing', () => {
  it("removes every topic of the user's and no one else's", async () => {
    await savePersisted(USER, 'strudel', entries(1));
    await savePersisted(USER, 'sql', entries(1));
    await savePersisted(OTHER, 'strudel', entries(1));

    await clearPersisted(USER);

    expect(await keys()).toStrictEqual(['feed:user-2:strudel']);
  });

  it('clears the persisted sets, the outbox and the query cache on sign-out', async () => {
    useSession.setState({ status: 'signedIn', userId: USER });
    await savePersisted(USER, 'strudel', entries(1));
    await savePersisted(USER, 'sql', entries(1));
    await savePersisted(OTHER, 'strudel', entries(1));
    const box = createOutbox({
      post: () => Promise.reject<undefined>(offline()),
      storage: AsyncStorage,
      session: useSession,
      schedule: () => () => undefined,
      newId: () => 'id-1',
    });
    box.add(attempt(1));
    queryClient.setQueryData(['me'], { id: USER });
    await settle();
    expect(await keys()).toContain('doomskill.outbox.v1.user-1');

    await signOut();
    await settle();

    expect(await keys()).toStrictEqual(['feed:user-2:strudel']);
    expect(box.pending()).toBe(0);
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
  });
});
