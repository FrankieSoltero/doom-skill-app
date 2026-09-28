// The session across sets: the round the store counts, the status once a set is held, and moves
// that come from a card of an earlier set. Kept apart from useFeedSession.test.tsx, which is at
// the file size limit.
import { act } from '@testing-library/react-native';

import type { FeedSet } from '../../data';
import { logError } from '../../log';
import { useFeedStore } from '../store';
import { flush, renderSession, step } from '../testing/session';
import { cardsByType, makeSet } from '../testing/sets';
import { controlledSource, scriptedSource } from '../testing/sources';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz } = cardsByType;

const store = () => useFeedStore.getState();

/** A second set whose first card is `first`, then a concept. */
const secondSet = (first: FeedSet['cards'][number]): FeedSet => ({
  ...makeSet(3, [first, concept]),
  setNumber: 2,
});

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
});

describe('useFeedSession: the round', () => {
  it("is the store's round: 1 for the first set, then 2, and the same after a remount", async () => {
    const source = scriptedSource(makeSet(3, [concept]), secondSet(concept));
    const first = await renderSession(source);
    expect(first.result.current.setRound).toBe(1);

    await act(() => first.result.current.loadNextSet());
    expect(first.result.current.setRound).toBe(2);
    first.unmount();

    const { result } = await renderSession(source);
    expect(result.current.setRound).toBe(2);
    expect(store().round).toBe(2);
  });
});

describe('useFeedSession: status once the store holds a set', () => {
  it('is ready though the load failed, once a set is started', async () => {
    const { result } = await renderSession(scriptedSource(new Error('offline')));
    expect(result.current.status).toBe('error');

    step(store().startSet, makeSet(3, [concept]));

    expect(result.current.status).toBe('ready');
  });

  it('is ready though the source had nothing, once a set is started', async () => {
    const { result } = await renderSession(scriptedSource(null));
    expect(result.current.status).toBe('empty');

    step(store().startSet, makeSet(3, [concept]));

    expect(result.current.status).toBe('ready');
  });

  it('keeps a load that fails after a set was started: still ready, on that set', async () => {
    const source = controlledSource();
    const { result } = await renderSession(source);
    const held = makeSet(3, [concept]);

    step(store().startSet, held);
    source.reject(new Error('offline'));
    await flush();

    expect(result.current).toMatchObject({ status: 'ready', set: held });
  });
});

describe('useFeedSession: a next from a card of an earlier set', () => {
  it.each([
    { row: 'an answered card on the same page: no move', first: concept },
    { row: 'an unanswered card on the same page: no toast', first: quiz },
  ])('does nothing in the new set: $row', async ({ first }) => {
    const source = scriptedSource(makeSet(3, [concept, quiz]), secondSet(first));
    const { result } = await renderSession(source);
    const oldRound = result.current.setRound;
    const staleNext = result.current.nextFrom;

    await act(() => result.current.loadNextSet());
    step(staleNext, 0, oldRound);

    expect(result.current).toMatchObject({ index: 0, toastVisible: false, setRound: 2 });
  });

  it('moves on when it comes from the current round', async () => {
    const source = scriptedSource(makeSet(3, [quiz]), secondSet(concept));
    const { result } = await renderSession(source);

    await act(() => result.current.loadNextSet());
    step(result.current.nextFrom, 0, result.current.setRound);

    expect(result.current.index).toBe(1);
  });
});

describe('useFeedSession: failed pages belong to their set', () => {
  it.each([
    {
      row: 'loaded by the session',
      start: (session: { loadNextSet: () => Promise<void> }) => session.loadNextSet(),
    },
    {
      row: 'started in the store directly',
      start: () => {
        store().startSet(secondSet(quiz));
        return Promise.resolve();
      },
    },
  ])('are cleared for a new set $row', async ({ start }) => {
    const source = scriptedSource(makeSet(3, [concept, quiz]), secondSet(quiz));
    const { result } = await renderSession(source);
    step(result.current.markFailed, 0);

    await act(() => start(result.current));
    // Page 0 of the new set is an unanswered quiz that has not failed: the gate is closed.
    expect(result.current.canAdvance).toBe(false);
    step(result.current.nextFrom, 0, result.current.setRound);

    expect(result.current).toMatchObject({ index: 0, toastVisible: true });
  });
});
