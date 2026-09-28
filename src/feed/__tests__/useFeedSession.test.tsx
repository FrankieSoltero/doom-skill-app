import { act, renderHook } from '@testing-library/react-native';

import type { Card, CardSource } from '../../data';
import { logError, logWarning } from '../../log';
import { useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';
import { controlledSource, scriptedSource } from '../testing/sources';
import { useFeedSession } from '../useFeedSession';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;

// Two cards: a concept (always answered) and a quiz (answered once an option is picked).
const firstSet = makeSet(3, [concept, quiz]);
const secondSet = { ...makeSet(3, [quiz, concept, concept]), setNumber: 2 };

// Captured before any test installs fake timers, so `flush` works under either kind.
const realSetImmediate = setImmediate;

/** Lets every pending promise settle, inside `act`. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      realSetImmediate(resolve);
    });
  });
}

async function renderSession(source: CardSource, canRender?: (card: Card) => boolean) {
  const view = renderHook(() => useFeedSession(source, canRender));
  await flush();
  return view;
}

const store = () => useFeedStore.getState();

/** Calls `action` with `args` inside `act`. */
function step<Args extends unknown[]>(action: (...args: Args) => unknown, ...args: Args): void {
  act(() => {
    action(...args);
  });
}

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
  jest.mocked(logWarning).mockClear();
});

describe('useFeedSession: the first set', () => {
  it('is loading, with no set, until the source answers', async () => {
    const source = controlledSource();
    const { result } = renderHook(() => useFeedSession(source));

    expect(result.current).toMatchObject({ status: 'loading', set: null, index: 0 });
    expect(source.getNextSet).toHaveBeenCalledTimes(1);

    source.resolve(firstSet);
    await flush();

    expect(result.current.status).toBe('ready');
  });

  it('starts the loaded set: ready, on its first page, nothing pending', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));

    expect(result.current).toMatchObject({
      status: 'ready',
      set: firstSet,
      index: 0,
      canAdvance: true,
      toastVisible: false,
      nextSetStatus: 'idle',
      setRound: 1,
    });
    expect(store().set).toStrictEqual(firstSet);
  });

  it('is empty when the first answer is null', async () => {
    const { result } = await renderSession(scriptedSource(null));

    expect(result.current).toMatchObject({ status: 'empty', set: null });
  });

  it('fails when the source rejects, and logs the error', async () => {
    const failure = new Error('offline');
    const { result } = await renderSession(scriptedSource(failure));

    expect(result.current.status).toBe('error');
    expect(jest.mocked(logError).mock.calls).toStrictEqual([['feed_load_failed', failure]]);
  });

  it('retries: loading while the source is asked again, then ready', async () => {
    const source = controlledSource();
    const { result } = renderHook(() => useFeedSession(source));
    source.reject(new Error('offline'));
    await flush();

    step(result.current.retry);

    expect(result.current.status).toBe('loading');
    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    source.resolve(firstSet);
    await flush();
    expect(result.current.status).toBe('ready');
  });

  it('asks the source once when retry is called again while a load is in flight', async () => {
    const source = controlledSource();
    const { result } = renderHook(() => useFeedSession(source));
    source.reject(new Error('offline'));
    await flush();

    act(() => {
      result.current.retry();
      result.current.retry();
    });
    await flush();

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
  });

  it('ignores an answer that arrives after unmount', async () => {
    const source = controlledSource();
    const { result, unmount } = renderHook(() => useFeedSession(source));

    unmount();
    source.resolve(firstSet);
    await flush();

    expect(result.current.status).toBe('loading');
    expect(store().set).toBeNull();
  });

  it('ignores a failure that arrives after unmount: no state change, nothing logged', async () => {
    const source = controlledSource();
    const { result, unmount } = renderHook(() => useFeedSession(source));

    unmount();
    source.reject(new Error('offline'));
    await flush();

    expect(result.current.status).toBe('loading');
    expect(logError).not.toHaveBeenCalled();
  });
});

describe('useFeedSession: cards the screen cannot render', () => {
  const conceptOnly = (card: Card) => card.type === 'concept';

  it('keeps every card when no filter is given', async () => {
    const all = makeSet(0, [concept, quiz, predict, exercise, review, checkpoint]);
    const { result } = await renderSession(scriptedSource(all));

    expect(result.current.set?.cards).toHaveLength(6);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('drops them before the set starts, and warns once per skipped type', async () => {
    const mixed = makeSet(3, [quiz, concept, quiz, predict, concept]);
    const { result } = await renderSession(scriptedSource(mixed), conceptOnly);

    expect(result.current.set?.cards).toStrictEqual([concept, concept]);
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
  it('cannot advance past an unanswered card, can once it is answered, never from the Summary', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));

    step(result.current.goTo, 1);
    expect(result.current).toMatchObject({ index: 1, canAdvance: false });

    step(store().setAnswer, 1, { kind: 'choice', picked: 0 });
    expect(result.current.canAdvance).toBe(true);

    step(result.current.goTo, 2);
    expect(result.current).toMatchObject({ index: 2, canAdvance: false });
  });

  it('counts a page marked failed as answered', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));
    step(result.current.goTo, 1);

    act(() => {
      result.current.markFailed(1);
      result.current.markFailed(1);
    });

    expect(result.current.canAdvance).toBe(true);
  });

  it('next moves one page on from an answered card', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));

    step(result.current.next);

    expect(result.current).toMatchObject({ index: 1, toastVisible: false });
  });

  it('next on an unanswered card stays and shows the toast', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));
    step(result.current.goTo, 1);

    step(result.current.next);

    expect(result.current).toMatchObject({ index: 1, toastVisible: true });
  });

  it('reaches the Summary once, by next or by goTo', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));
    act(() => {
      result.current.goTo(1);
      store().setAnswer(1, { kind: 'choice', picked: 0 });
    });

    step(result.current.next);
    expect(store()).toMatchObject({ index: 2, streak: 4, totals: { cards: 2, seconds: 50 } });

    step(result.current.goTo, 1);
    step(result.current.goTo, 2);
    expect(store()).toMatchObject({ streak: 4, totals: { cards: 2, seconds: 50 } });
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

  it('shows for 1,400 ms', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));

    step(result.current.blocked);
    advance(1399);
    expect(result.current.toastVisible).toBe(true);
    advance(1);
    expect(result.current.toastVisible).toBe(false);
  });

  it('restarts its 1,400 ms when blocked again while it shows', async () => {
    const { result } = await renderSession(scriptedSource(firstSet));
    step(result.current.blocked);
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
    act(() => {
      store().setAnswer(1, { kind: 'choice', picked: 0 });
      view.result.current.goTo(2);
    });
    return view;
  }

  it('is loading meanwhile, then starts the next set on its first page', async () => {
    const source = controlledSource();
    const { result } = renderHook(() => useFeedSession(source));
    source.resolve(firstSet);
    await flush();
    act(() => {
      result.current.markFailed(0);
      result.current.goTo(2);
    });

    let loaded: Promise<void> = Promise.resolve();
    act(() => {
      loaded = result.current.loadNextSet();
    });
    expect(result.current.nextSetStatus).toBe('loading');
    source.resolve(secondSet);
    await act(() => loaded);

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
    const failure = new Error('offline');
    const { result } = await onSummary(scriptedSource(firstSet, failure));

    await act(() => result.current.loadNextSet());

    expect(result.current).toMatchObject({ set: firstSet, index: 2, nextSetStatus: 'error' });
    expect(store().answers).toStrictEqual({ 1: { kind: 'choice', picked: 0 } });
    expect(logError).toHaveBeenCalledWith('next_set_load_failed', failure);
  });

  it('asks the source once when called again while a load is in flight', async () => {
    const source = controlledSource();
    const { result } = renderHook(() => useFeedSession(source));
    source.resolve(firstSet);
    await flush();

    act(() => {
      void result.current.loadNextSet();
      void result.current.loadNextSet();
    });
    source.resolve(secondSet);
    await flush();

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    expect(result.current.set).toStrictEqual(secondSet);
  });

  it('ignores a next set that arrives after unmount', async () => {
    const source = controlledSource();
    const { result, unmount } = renderHook(() => useFeedSession(source));
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
