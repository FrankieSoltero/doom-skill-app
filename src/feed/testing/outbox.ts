// Test support: the attempt outbox (src/feed/outbox.ts) over in-memory storage, a network the
// test answers, timers it fires and a session it signs in and out, shared by the outbox tests.
// Not app code.
import { ApiError } from '../../api/errors';
import { createOutbox, type Attempt, type OutboxDeps, type SessionView } from '../outbox';

/** The user the rig's session starts signed in as. */
export const USER = 'user-1';

/** The storage key the outbox keeps `user`'s attempts under. */
export const keyOf = (user: string) => `learnloop.outbox.v1.${user}`;

const KEY = keyOf(USER);

/** A session the test moves: its state, and the listeners the outbox added. */
export function fakeSession(initial: SessionView) {
  let state = initial;
  const listeners = new Set<(state: SessionView) => void>();
  return {
    getState: () => state,
    subscribe: (listener: (state: SessionView) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Moves the session to `next` and tells the listeners. */
    set: (next: SessionView) => {
      state = next;
      listeners.forEach((listener) => {
        listener(state);
      });
    },
  };
}

/** A signed-in state for `user`, and the signed-out and loading states. */
export const signedIn = (user: string): SessionView => ({ status: 'signedIn', userId: user });
export const SIGNED_OUT: SessionView = { status: 'signedOut', userId: null };
export const LOADING: SessionView = { status: 'loading', userId: null };

/** An attempt at card `n`. */
export function attempt(n: number, response: Attempt['response'] = { choice: 1 }): Attempt {
  return {
    cardId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    response,
    durationMs: 1_000,
    feedDate: '2026-10-01',
    setNumber: 1,
  };
}

type Timer = { ms: number; run: () => void; cancelled: boolean };

/** Lets every pending promise settle. */
export const settle = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

/** A network failure, as the API client reports it. */
export const offline = () => new ApiError('offline', 0);

/**
 * The outbox over in-memory storage, a network the test answers, timers, and a session signed in
 * as `USER` unless `session` says otherwise. `stored` is what storage holds under `USER`'s key;
 * `saved` may hold more.
 */
export function rig(
  stored: string | null = null,
  { session = fakeSession(signedIn(USER)), saved = new Map<string, string>() } = {},
) {
  if (stored !== null) saved.set(KEY, stored);
  const answers: (ApiError | Error | null)[] = [];
  const timers: Timer[] = [];
  let ids = 0;
  const post = jest.fn((_sent: Parameters<OutboxDeps['post']>[0]) => {
    const answer = answers.shift() ?? null;
    return answer === null ? Promise.resolve() : Promise.reject(answer);
  });
  const storage = {
    getItem: jest.fn((key: string) => Promise.resolve(saved.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      saved.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      saved.delete(key);
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve([...saved.keys()])),
  };
  const outbox = createOutbox({
    post,
    storage,
    session,
    schedule: (run, ms) => {
      const timer = { ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    newId: () => `id-${String((ids += 1))}`,
  });
  const live = () => timers.filter((timer) => !timer.cancelled);
  return {
    outbox,
    post,
    storage,
    session,
    saved,
    answers,
    live,
    /** The ids of the attempts posted, in order. */
    sent: () => post.mock.calls.map(([sent]) => sent.clientAttemptId),
    /** The attempts in storage. */
    kept: () => JSON.parse(saved.get(KEY) ?? '[]') as { clientAttemptId: string }[],
    /** Fires the one live timer. */
    fire: async () => {
      const [timer, ...others] = live();
      expect(others).toStrictEqual([]);
      if (timer === undefined) throw new Error('no timer to fire');
      timer.cancelled = true;
      timer.run();
      await settle();
    },
  };
}
