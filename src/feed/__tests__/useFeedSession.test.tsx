import { act, renderHook } from '@testing-library/react-native';

import type { Card, CardSource } from '../../data';
import { logError, logWarning } from '../../log';
import { useFeedStore } from '../store';
import { flush, renderSession, step } from '../testing/session';
import { cardsByType, makeSet } from '../testing/sets';
import { controlledSource, scriptedSource } from '../testing/sources';
import { useFeedSession } from '../useFeedSession';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz, predict } = cardsByType;

// Two cards: a concept (always answered) and a quiz (answered once an option is picked).
const firstSet = makeSet(3, [concept, quiz]);
const secondSet = { ...makeSet(3, [quiz, concept, concept]), setNumber: 2 };

const failure = new Error('offline');

const store = () => useFeedStore.getState();

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
  jest.mocked(logWarning).mockClear();
});

describe('useFeedSession: the first set', () => {
  it("is loading until the source answers, then ready on the set's first page", async () => {
    const source = controlledSource();
    const { result } = renderHook(() => useFeedSession(source));
    expect(result.current).toMatchObject({ status: 'loading', set: null, index: 0 });
    expect(source.getNextSet).toHaveBeenCalledTimes(1);

    source.resolve(firstSet);
    await flush();

    expect(result.current).toMatchObject({
      status: 'ready',
      set: firstSet,
      index: 0,
      canAdvance: true,
      toastVisible: false,
      nextSetStatus: 'idle',
      setRound: 1,
    });
    // With no filter every card is kept, and nothing is skipped.
    expect(store().set).toStrictEqual(firstSet);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it.each([
    { answer: null, status: 'empty', logged: [] },
    { answer: failure, status: 'error', logged: [['feed_load_failed', failure]] },
  ])('is $status when the first answer is $answer', async ({ answer, status, logged }) => {
    const { result } = await renderSession(scriptedSource(answer));

    expect(result.current).toMatchObject({ status, set: null });
    expect(jest.mocked(logError).mock.calls).toStrictEqual(logged);
  });

  it('retries once, however often it is called: loading meanwhile, then ready', async () => {
    const source = controlledSource();
    const { result } = await renderSession(source);
    source.reject(failure);
    await flush();

    act(() => {
      result.current.retry();
      result.current.retry();
    });

    expect(result.current.status).toBe('loading');
    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    source.resolve(firstSet);
    await flush();
    expect(result.current.status).toBe('ready');
  });

  it.each([
    { outcome: 'an answer', answer: firstSet },
    { outcome: 'a failure', answer: failure },
  ])(
    'ignores $outcome that arrives after unmount: no change, nothing logged',
    async ({ answer }) => {
      const source = scriptedSource(answer);
      const { result, unmount } = renderHook(() => useFeedSession(source));

      // The source's answer is a settled promise, but the hook reads it only after this unmount.
      unmount();
      await flush();

      expect(result.current.status).toBe('loading');
      expect(store().set).toBeNull();
      expect(logError).not.toHaveBeenCalled();
    },
  );
});

describe('useFeedSession: cards the screen cannot render', () => {
  const conceptOnly = (card: Card) => card.type === 'concept';

  it('drops them before the set starts, and warns once per skipped type', async () => {
    const mixed = makeSet(3, [quiz, concept, quiz, predict, concept]);
    const { result } = await renderSession(scriptedSource(mixed), conceptOnly);

    // The hook's set is the store's, so the header, the pager and the totals see the same cards.
    expect(result.current.set).toBe(store().set);
    expect(store().set?.cards).toStrictEqual([concept, concept]);
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['card_type_skipped', { type: 'quiz' }],
      ['card_type_skipped', { type: 'predict' }],
    ]);
  });

  it('is empty when no card of the first set can be rendered', async () => {
    const { result } = await renderSession(scriptedSource(makeSet(3, [quiz])), conceptOnly);

    expect(result.current.status).toBe('empty');
    expect(store().set).toBeNull();
  });

  it('reports no next set when no card of it can be rendered', async () => {
    const source = scriptedSource(makeSet(3, [concept]), makeSet(3, [quiz]));
    const { result } = await renderSession(source, conceptOnly);

    await act(() => result.current.loadNextSet());

    expect(result.current.nextSetStatus).toBe('none');
    expect(result.current.set?.cards).toStrictEqual([concept]);
  });
});

describe('useFeedSession: moving through the set', () => {
  it('gates advancing and goTo, never from the Summary; going back always moves', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));

    // goTo takes one page on only through an open gate.
    step(result.current.goTo, 2);
    expect(result.current.index).toBe(0);
    step(result.current.goTo, 1);
    expect(result.current).toMatchObject({ index: 1, canAdvance: false });
    step(result.current.goTo, 2);
    expect(result.current.index).toBe(1);

    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });
    expect(result.current.canAdvance).toBe(true);

    step(result.current.goTo, 2);
    expect(result.current).toMatchObject({ index: 2, canAdvance: false });

    step(result.current.goTo, 0);
    expect(result.current.index).toBe(0);
  });

  it('reaches the Summary once, by next or by goTo', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));
    step(result.current.goTo, 1);
    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });

    step(result.current.next);
    expect(store()).toMatchObject({ index: 2, streak: 4, totals: { cards: 2, seconds: 50 } });

    step(result.current.goTo, 1);
    step(result.current.goTo, 2);
    expect(store()).toMatchObject({ streak: 4, totals: { cards: 2, seconds: 50 } });
  });
});

describe('useFeedSession: the gate at the moment of the move', () => {
  it('next right after setAnswer, in the same handler, moves on with no toast', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));
    step(result.current.goTo, 1);

    act(() => {
      store().setAnswer(1, { kind: 'choice', picked: 0 });
      result.current.next();
    });

    expect(result.current).toMatchObject({ index: 2, toastVisible: false });
  });

  it("nextFrom a page the learner has left does nothing, even that page's own late call", async () => {
    const { result } = await renderSession(scriptedSource(firstSet));
    step(result.current.goTo, 1);
    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });
    const lateNext = result.current.nextFrom;

    step(result.current.goTo, 0);
    step(lateNext, 1, result.current.setRound);

    expect(result.current).toMatchObject({ index: 0, toastVisible: false });
  });

  it('nextFrom and next on the current card move on through the gate, or show the toast', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));

    step(result.current.nextFrom, 0, result.current.setRound);
    expect(result.current).toMatchObject({ index: 1, toastVisible: false });
    step(result.current.next);
    expect(result.current).toMatchObject({ index: 1, toastVisible: true });
  });

  it('next and nextFrom do nothing on the Summary page: no move, no toast', async () => {
    const { result } = await renderSession(scriptedSource(makeSet(3, [concept])));
    step(result.current.goTo, 1);

    step(result.current.next);
    step(result.current.nextFrom, 1, result.current.setRound);

    expect(result.current).toMatchObject({ index: 1, toastVisible: false });
  });
});

describe('useFeedSession: resuming a set in progress', () => {
  it('is ready from its first render, and asks nothing, when the store holds a set', async () => {
    store().startSet(firstSet);
    const source = scriptedSource(secondSet);
    const seen: string[] = [];

    renderHook(() => {
      const session = useFeedSession(source);
      seen.push(session.status);
      return session;
    });
    await flush();

    expect(new Set(seen)).toStrictEqual(new Set(['ready']));
    expect(source.getNextSet).not.toHaveBeenCalled();
    expect(store().set).toStrictEqual(firstSet);
  });

  it('keeps the set, its page and its answers across an unmount and a fresh mount', async () => {
    const source = scriptedSource(firstSet, secondSet);
    const first = await renderSession(source);
    step(first.result.current.goTo, 1);
    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });
    first.unmount();

    const { result } = await renderSession(source);

    expect(source.getNextSet).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ status: 'ready', set: firstSet, index: 1 });
    expect(store().answers).toStrictEqual({ 1: { kind: 'choice', picked: 0 } });
  });
});

describe('useFeedSession: the toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const advance = (ms: number) => {
    act(() => {
      jest.advanceTimersByTime(ms);
    });
  };

  /** A session whose gate was just blocked. */
  async function blockedSession() {
    const view = await renderSession(scriptedSource(firstSet));
    step(view.result.current.blocked);
    return view;
  }

  it('shows for 1,400 ms', async () => {
    const { result } = await blockedSession();

    advance(1399);
    expect(result.current.toastVisible).toBe(true);
    advance(1);
    expect(result.current.toastVisible).toBe(false);
  });

  it('restarts its 1,400 ms when blocked again while it shows', async () => {
    const { result } = await blockedSession();
    advance(1000);

    step(result.current.blocked);
    advance(1399);
    expect(result.current.toastVisible).toBe(true);
    advance(1);
    expect(result.current.toastVisible).toBe(false);
  });

  it('clears its timer on unmount', async () => {
    const { result, unmount } = await renderSession(scriptedSource(firstSet));
    // React may hold a fake timer of its own here, so count relative to it.
    const others = jest.getTimerCount();
    step(result.current.blocked);
    expect(jest.getTimerCount()).toBe(others + 1);

    unmount();

    expect(jest.getTimerCount()).toBeLessThanOrEqual(others);
  });
});

describe('useFeedSession: the next set', () => {
  async function onSummary(source: CardSource) {
    const view = await renderSession(source);
    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });
    step(view.result.current.goTo, 1);
    step(view.result.current.goTo, 2);
    return view;
  }

  it('is loading meanwhile, asks once however often it is called, then starts the next set', async () => {
    const source = controlledSource();
    const { result } = await renderSession(source);
    source.resolve(firstSet);
    await flush();
    act(() => {
      result.current.markFailed(0);
      result.current.markFailed(1);
      result.current.markFailed(1);
    });
    step(result.current.goTo, 1);
    // A page that failed to render counts as answered, so the gate is open on the unanswered quiz.
    expect(result.current.canAdvance).toBe(true);
    step(result.current.goTo, 2);
    expect(result.current.index).toBe(2);

    let loaded: Promise<void> = Promise.resolve();
    act(() => {
      loaded = result.current.loadNextSet();
      void result.current.loadNextSet();
    });
    expect(result.current.nextSetStatus).toBe('loading');
    source.resolve(secondSet);
    await act(() => loaded);

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    expect(result.current).toMatchObject({
      set: secondSet,
      index: 0,
      nextSetStatus: 'idle',
      setRound: 2,
      canAdvance: false,
    });
    expect(store().answers).toStrictEqual({});
  });

  it('keeps the current set when there is no next set', async () => {
    const { result } = await onSummary(scriptedSource(firstSet, null));

    await act(() => result.current.loadNextSet());

    expect(result.current).toMatchObject({ set: firstSet, index: 2, nextSetStatus: 'none' });
  });

  it('keeps the set and its answers when the next set fails, and logs the error', async () => {
    const { result } = await onSummary(scriptedSource(firstSet, failure));

    await act(() => result.current.loadNextSet());

    expect(result.current).toMatchObject({ set: firstSet, index: 2, nextSetStatus: 'error' });
    expect(store().answers).toStrictEqual({ 1: { kind: 'choice', picked: 0 } });
    expect(logError).toHaveBeenCalledWith('next_set_load_failed', failure);
  });

  it('ignores a next set that arrives after unmount', async () => {
    const source = controlledSource();
    const { result, unmount } = await renderSession(source);
    source.resolve(firstSet);
    await flush();
    act(() => {
      void result.current.loadNextSet();
    });

    unmount();
    source.resolve(secondSet);
    await flush();

    expect(store().set).toStrictEqual(firstSet);
  });
});
