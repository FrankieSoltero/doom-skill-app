// The recorded summary (src/feed/useSummary.ts): on the Summary page, once the outbox holds no
// attempt, the set's summary from the API replaces the projected one in the store, at most once.
// The loader and the outbox are the test's own; nothing leaves the test.
import { act, renderHook } from '@testing-library/react-native';

import { FeedLoadError, type FeedSet, type Summary } from '../../data';
import { logWarning } from '../../log';
import { useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';
import { useSummary, type SummaryDeps } from '../useSummary';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const API_SET: FeedSet = {
  ...makeSet(0, [{ ...cardsByType.quiz, id: '00000000-0000-4000-8000-000000000001' }]),
  setNumber: 3,
  feedDate: '2026-10-01',
};

const RECORDED: Summary = {
  title: 'Recorded',
  progressDelta: 5,
  moved: [['Rests ~', 0.2, 0.4]],
  tomorrow: 'Euclidean rhythms',
  reminder: '8:30 pm',
};

const settle = () =>
  act(async () => {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  });

/** A loader the test answers, and an outbox whose count the test sets. */
function fakes(pending = 0) {
  let count = pending;
  const listeners = new Set<() => void>();
  const load = jest.fn((_asked: Parameters<NonNullable<SummaryDeps['load']>>[0]) =>
    Promise.resolve(RECORDED),
  );
  const deps: SummaryDeps = {
    load,
    outbox: {
      pending: () => count,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
  const setPending = (next: number) => {
    act(() => {
      count = next;
      listeners.forEach((listener) => {
        listener();
      });
    });
  };
  return { deps, load, setPending };
}

const recorded = () => useFeedStore.getState().recordedSummary;

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  useFeedStore.getState().startSet(API_SET);
  jest.mocked(logWarning).mockClear();
});

describe('useSummary', () => {
  it('asks for the set by topic, number and date on the Summary page, and records the answer', async () => {
    const { deps, load } = fakes();

    renderHook(() => {
      useSummary(true, deps);
    });
    await settle();

    expect(load.mock.calls).toStrictEqual([
      [{ topic: 'strudel', setNumber: 3, feedDate: '2026-10-01' }],
    ]);
    expect(recorded()).toStrictEqual(RECORDED);
  });

  it('asks nothing while the Summary is not the current page', async () => {
    const { deps, load } = fakes();

    renderHook(() => {
      useSummary(false, deps);
    });
    await settle();

    expect(load).not.toHaveBeenCalled();
    expect(recorded()).toBeNull();
  });

  it('waits while attempts are pending, then asks once the outbox is empty', async () => {
    const { deps, load, setPending } = fakes(2);
    renderHook(() => {
      useSummary(true, deps);
    });
    await settle();
    expect(load).not.toHaveBeenCalled();

    setPending(1);
    await settle();
    expect(load).not.toHaveBeenCalled();
    setPending(0);
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    expect(recorded()).toStrictEqual(RECORDED);
  });
});

describe('useSummary keeps the numbers steady', () => {
  it('keeps the projected summary when the request fails, logs the kind, and does not ask again', async () => {
    const { deps, load, setPending } = fakes();
    load.mockRejectedValueOnce(new FeedLoadError('secret-marker', { kind: 'offline' }));
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => {
        useSummary(active, deps);
      },
      { initialProps: { active: true } },
    );
    await settle();

    // The learner leaves the Summary and comes back, and answers wait and go out meanwhile.
    rerender({ active: false });
    rerender({ active: true });
    setPending(1);
    setPending(0);
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    expect(recorded()).toBeNull();
    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([
      ['summary_load_failed', { kind: 'offline' }],
    ]);
  });

  it.each([
    [new TypeError('secret-marker'), 'TypeError'],
    ['secret-marker', 'string'],
  ])('logs any other failure by its class name only', async (failure, kind) => {
    const { deps, load } = fakes();
    load.mockRejectedValueOnce(failure);
    renderHook(() => {
      useSummary(true, deps);
    });
    await settle();

    expect(jest.mocked(logWarning).mock.calls).toStrictEqual([['summary_load_failed', { kind }]]);
  });

  it('changes the numbers at most once: a recorded summary is not asked for or replaced again', async () => {
    const { deps, load } = fakes();
    const first = renderHook(() => {
      useSummary(true, deps);
    });
    await settle();
    first.unmount();

    renderHook(() => {
      useSummary(true, deps);
    });
    await settle();
    act(() => {
      useFeedStore.getState().recordSummary(1, { ...RECORDED, title: 'Again' });
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(recorded()).toStrictEqual(RECORDED);
  });

  it('drops an answer that arrives after the next set started', async () => {
    const { deps, load } = fakes();
    let answer: (summary: Summary) => void = () => undefined;
    load.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    // The old set's Summary page is left: the next set starts on its first card.
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => {
        useSummary(active, deps);
      },
      { initialProps: { active: true } },
    );
    await settle();

    rerender({ active: false });
    act(() => {
      useFeedStore.getState().startSet({ ...API_SET, setNumber: 4 });
    });
    answer(RECORDED);
    await settle();

    expect(load).toHaveBeenCalledTimes(1);
    expect(recorded()).toBeNull();
  });
});

describe('useSummary with the demo sets', () => {
  it('is inert for a set the API did not serve, and without an API', async () => {
    const { deps, load } = fakes();
    useFeedStore.getState().startSet(makeSet(0, [cardsByType.quiz]));
    renderHook(() => {
      useSummary(true, deps);
    });
    renderHook(() => {
      useSummary(true, { ...deps, load: null });
    });
    await settle();

    expect(load).not.toHaveBeenCalled();
    expect(recorded()).toBeNull();
  });

  it('is inert with the app defaults in this run: the demo sets, no API', async () => {
    renderHook(() => {
      useSummary(true);
    });
    await settle();

    expect(recorded()).toBeNull();
  });
});

describe('the store keeps the recorded summary', () => {
  it('for its own set only, and forgets it when the next set starts', () => {
    const { round } = useFeedStore.getState();
    useFeedStore.getState().recordSummary(round + 1, RECORDED);
    expect(recorded()).toBeNull();

    useFeedStore.getState().recordSummary(round, RECORDED);
    expect(recorded()).toStrictEqual(RECORDED);

    useFeedStore.getState().startSet(API_SET);
    expect(recorded()).toBeNull();
  });
});
