// Test support: fake card sources for the feed session and Today screen tests, so no test depends
// on the shared `cardSource`, which serves the next demo set on every call and keeps its place for
// the module registry. Not app code.
import type { FeedSet } from '../../data';

/** What a scripted call answers: a set, `null` for "no more sets", or an Error to reject with. */
type Outcome = FeedSet | null | Error;

/** A card source whose `getNextSet` is a Jest mock, declared as a property so tests can read it. */
type MockedSource = {
  getNextSet: jest.Mock<Promise<FeedSet | null>, []>;
};

/**
 * A source that answers its calls with `outcomes`, in order, and then with `null`. An Error in the
 * list makes that call reject.
 */
export function scriptedSource(...outcomes: Outcome[]): MockedSource {
  const getNextSet = jest.fn<Promise<FeedSet | null>, []>().mockResolvedValue(null);
  for (const outcome of outcomes) {
    getNextSet.mockImplementationOnce(() =>
      outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome),
    );
  }
  return { getNextSet };
}

type ControlledSource = MockedSource & {
  /** Resolves the latest call with `set`. */
  resolve: (set: FeedSet | null) => void;
  /** Rejects the latest call with `error`. */
  reject: (error: unknown) => void;
};

/** A source whose calls stay pending until the test resolves or rejects the latest one. */
export function controlledSource(): ControlledSource {
  // `jest.fn()` until the first call, so settling before any call does nothing.
  let settle: Pick<ControlledSource, 'resolve' | 'reject'> = {
    resolve: jest.fn(),
    reject: jest.fn(),
  };
  const getNextSet = jest.fn(
    () =>
      new Promise<FeedSet | null>((resolve, reject) => {
        settle = { resolve, reject };
      }),
  );
  return {
    getNextSet,
    resolve: (set) => {
      settle.resolve(set);
    },
    reject: (error) => {
      settle.reject(error);
    },
  };
}
