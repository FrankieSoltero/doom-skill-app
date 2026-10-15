// The feed offline (offline-topic plan Task 6, O1 and O2): after a set the server served, the
// session asks for the sets ahead (one request at a time) and keeps them with the ids of the cards
// answered; when the server cannot be reached it serves the first kept set not fully answered,
// from its first unanswered card; with none left it is `offline`, the end card. Storage is the
// library's in-memory Jest mock.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';

import { useSession } from '../../auth/useSession';
import { FeedLoadError, type Card, type FeedSet } from '../../data';
import { logError, logWarning } from '../../log';
import { loadPersisted, savePersisted } from '../persist';
import { useFeedStore } from '../store';
import { flush, renderSession, step } from '../testing/session';
import { cardsByType, makeSet } from '../testing/sets';
import { scriptedSource } from '../testing/sources';
import { loadActiveTopic, switchTo } from '../useActiveTopic';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const USER = 'user-1';
const SLUG = 'strudel';

/** The id of card `card` of set `set`. */
const idOf = (set: number, card: number) =>
  `00000000-0000-4000-8000-${String(set * 100 + card).padStart(12, '0')}`;

/** Set `n` of the topic, served on 1 October: a concept and two quizzes. */
function setOf(n: number): FeedSet {
  const cards = [
    { ...cardsByType.concept, id: idOf(n, 1) },
    { ...cardsByType.quiz, id: idOf(n, 2) },
    { ...cardsByType.quiz, id: idOf(n, 3) },
  ];
  return { ...makeSet(0, cards), setNumber: n, feedDate: '2026-10-01' };
}

const allOf = (n: number) => [idOf(n, 1), idOf(n, 2), idOf(n, 3)];

const failing = (kind: 'offline' | 'timeout' | 'server') =>
  new FeedLoadError(`Feed request failed: ${kind}`, { kind });

const store = () => useFeedStore.getState();

/** The set numbers kept for the user's topic, and the answered ids of each. */
async function kept() {
  const entries = await loadPersisted(USER, SLUG);
  return entries.map(({ set, answered }) => ({ n: set.setNumber, answered: [...answered].sort() }));
}

/** Answers every card of the set on screen and reaches its Summary. */
function finishSet(): void {
  const cards = store().set?.cards ?? [];
  cards.forEach((card, page) => {
    if (card.type === 'quiz') step(store().setAnswer, page, { kind: 'choice', picked: 0 });
    step(store().setIndex, page + 1);
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await loadActiveTopic();
  useSession.setState({ status: 'signedIn', userId: USER });
  await switchTo(SLUG);
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
  jest.mocked(logWarning).mockClear();
});

describe('the sets ahead', () => {
  it('are asked for once after the first set, and kept with it: 4 entries', async () => {
    const source = scriptedSource(setOf(1));
    source.ahead.mockResolvedValue([setOf(2), setOf(3), setOf(4)]);

    const { result } = await renderSession(source);
    await flush();

    expect(result.current.status).toBe('ready');
    expect(source.ahead.mock.calls).toStrictEqual([[SLUG, 3]]);
    expect((await kept()).map(({ n }) => n)).toStrictEqual([1, 2, 3, 4]);
  });

  it('are asked for once while a request is in flight; a late answer never keeps a finished set', async () => {
    const source = scriptedSource(setOf(1), setOf(2), setOf(3), setOf(4));
    let answer: (sets: FeedSet[]) => void = () => undefined;
    source.ahead.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { result } = await renderSession(source);

    finishSet();
    await act(() => result.current.loadNextSet());
    finishSet();
    await act(() => result.current.loadNextSet());
    expect(store().set?.setNumber).toBe(3);
    expect(source.ahead).toHaveBeenCalledTimes(1);

    // The answer was asked for at set 1: sets 1 and 2 are finished, so set 3 is kept from it.
    answer([setOf(2), setOf(3), setOf(4)]);
    await flush();
    expect(await kept()).toStrictEqual([
      { n: 3, answered: [] },
      { n: 4, answered: [] },
    ]);
    await act(() => result.current.loadNextSet());
    expect(source.ahead).toHaveBeenCalledTimes(2);
    answer([]);
    await flush();
  });

  it('that fail are ignored: logged by kind, the set kept alone, the session ready', async () => {
    const source = scriptedSource(setOf(1));
    source.ahead.mockRejectedValue(failing('offline'));

    const { result } = await renderSession(source);
    await flush();

    expect(result.current.status).toBe('ready');
    expect(jest.mocked(logWarning).mock.calls).toContainEqual([
      'feed_ahead_failed',
      { kind: 'offline' },
    ]);
    expect(logError).not.toHaveBeenCalled();
    expect(await kept()).toStrictEqual([{ n: 1, answered: [] }]);
  });

  it('are kept with the answers made while they were asked for', async () => {
    const source = scriptedSource(setOf(1));
    let answer: (sets: FeedSet[]) => void = () => undefined;
    source.ahead.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    await renderSession(source);

    step(store().setIndex, 1);
    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });
    answer([setOf(2)]);
    await flush();

    expect(await kept()).toStrictEqual([
      { n: 1, answered: [idOf(1, 1), idOf(1, 2)] },
      { n: 2, answered: [] },
    ]);
  });
});

describe('offline', () => {
  it('serves the first kept set from its first unanswered card, asking for nothing ahead', async () => {
    await savePersisted(USER, SLUG, [
      { set: setOf(1), answered: [idOf(1, 1)] },
      { set: setOf(2), answered: [] },
      { set: setOf(3), answered: [] },
    ]);
    const source = scriptedSource(failing('offline'));

    const { result } = await renderSession(source);
    await flush();

    expect(result.current.status).toBe('ready');
    expect(store().set?.setNumber).toBe(1);
    expect(store().set?.cards.map(({ id }) => id)).toStrictEqual([idOf(1, 2), idOf(1, 3)]);
    expect(source.ahead).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('counts the dropped cards of a kept set answered once served, and the cards it cannot show', async () => {
    const dropped = idOf(9, 9);
    await savePersisted(USER, SLUG, [
      { set: { ...setOf(1), droppedIds: [dropped] }, answered: [idOf(1, 1)] },
      { set: setOf(2), answered: [] },
    ]);
    const conceptOnly = (card: Card) => card.type === 'concept';

    await renderSession(scriptedSource(failing('offline')), conceptOnly);
    await flush();

    // Set 1's open cards are quizzes the screen cannot show, so set 2 is served, from its concept.
    expect(store().set?.setNumber).toBe(2);
    expect(store().set?.cards.map(({ id }) => id)).toStrictEqual([idOf(2, 1)]);

    useFeedStore.setState(useFeedStore.getInitialState(), true);
    await renderSession(scriptedSource(failing('offline')));
    await flush();
    expect(store().set?.setNumber).toBe(1);
    expect((await kept())[0]?.answered).toStrictEqual([idOf(1, 1), dropped].sort());
  });

  it('never serves the set on screen again once its Summary was reached past a failed page', async () => {
    const source = scriptedSource(setOf(1), failing('offline'));
    const { result } = await renderSession(source);
    await flush();
    step(result.current.goTo, 1);
    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });
    step(result.current.markFailed, 2);
    step(result.current.goTo, 2);
    step(result.current.goTo, 3);
    await flush();
    expect(store().setCounted).toBe(true);

    await act(() => result.current.loadNextSet());
    await flush();

    expect(result.current.status).toBe('offline');
  });

  it('serves set 2 after a restart once all of set 1 was answered', async () => {
    const online = scriptedSource(setOf(1));
    online.ahead.mockResolvedValue([setOf(2), setOf(3), setOf(4)]);
    const first = await renderSession(online);
    await flush();
    finishSet();
    await flush();
    first.unmount();

    // The app restarts: the store is new, and the server cannot be reached (a timeout).
    useFeedStore.setState(useFeedStore.getInitialState(), true);
    const { result } = await renderSession(scriptedSource(failing('timeout')));
    await flush();

    expect(result.current.status).toBe('ready');
    expect(store().set?.setNumber).toBe(2);
    expect(store().set?.cards.map(({ id }) => id)).toStrictEqual(allOf(2));
  });

  it('serves the next kept set when the next set cannot be loaded', async () => {
    const source = scriptedSource(setOf(1), failing('offline'));
    source.ahead.mockResolvedValue([setOf(2), setOf(3)]);
    const { result } = await renderSession(source);
    await flush();
    finishSet();

    await act(() => result.current.loadNextSet());
    await flush();

    expect(store().set?.setNumber).toBe(2);
    expect(result.current).toMatchObject({ status: 'ready', nextSetStatus: 'idle', setRound: 2 });
    expect(source.ahead).toHaveBeenCalledTimes(1);
  });
});

describe('offline, with every kept set answered', () => {
  it('is offline when every kept set is answered, and when none is kept', async () => {
    await savePersisted(USER, SLUG, [{ set: setOf(1), answered: allOf(1) }]);
    const { result } = await renderSession(scriptedSource(failing('offline')));
    await flush();
    expect(result.current).toMatchObject({ status: 'offline', set: null });

    await AsyncStorage.clear();
    const none = await renderSession(scriptedSource(failing('timeout')));
    await flush();
    expect(none.result.current.status).toBe('offline');
    expect(logError).not.toHaveBeenCalled();
  });

  it('is offline when the last kept set is finished and the next cannot be loaded', async () => {
    const source = scriptedSource(setOf(1), failing('offline'));
    const { result } = await renderSession(source);
    await flush();
    finishSet();
    await flush();

    await act(() => result.current.loadNextSet());
    await flush();

    expect(result.current.status).toBe('offline');
  });

  it("serves the server's set again once a load succeeds, and keeps the sets after it", async () => {
    await savePersisted(USER, SLUG, [{ set: setOf(1), answered: allOf(1) }]);
    const source = scriptedSource(failing('offline'), setOf(5));
    source.ahead.mockResolvedValue([setOf(6), setOf(7), setOf(8)]);
    const { result } = await renderSession(source);
    await flush();
    expect(result.current.status).toBe('offline');

    step(result.current.retry);
    await flush();
    await flush();

    expect(result.current.status).toBe('ready');
    expect(store().set?.setNumber).toBe(5);
    expect((await kept()).map(({ n }) => n)).toStrictEqual([5, 6, 7, 8]);
  });
});

describe('other failures, and no signed-in user', () => {
  it("is today's error for any other failure, the kept sets left unserved", async () => {
    await savePersisted(USER, SLUG, [{ set: setOf(1), answered: [] }]);
    const failure = failing('server');

    const { result } = await renderSession(scriptedSource(failure));
    await flush();

    expect(result.current).toMatchObject({ status: 'error', set: null });
    expect(jest.mocked(logError).mock.calls).toStrictEqual([['feed_load_failed', failure]]);
  });

  it("is today's error with no signed-in user: nothing is kept for nobody", async () => {
    useSession.setState({ status: 'signedOut', userId: null });
    const failure = failing('offline');

    const { result } = await renderSession(scriptedSource(failure));
    await flush();

    expect(result.current.status).toBe('error');
  });

  it('keeps nothing and asks for nothing ahead with no signed-in user', async () => {
    useSession.setState({ status: 'signedOut', userId: null });
    const source = scriptedSource(setOf(1));

    const { result } = await renderSession(source);
    step(store().setIndex, 1);
    await flush();

    expect(result.current.status).toBe('ready');
    expect(source.ahead).not.toHaveBeenCalled();
    expect(await AsyncStorage.getAllKeys()).not.toContainEqual(expect.stringMatching(/^feed:/));
  });
});
