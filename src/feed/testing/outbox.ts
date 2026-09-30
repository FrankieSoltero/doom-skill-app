// Test support: the attempt outbox (src/feed/outbox.ts) over in-memory storage, a network the
// test answers and timers it fires, shared by the outbox tests. Not app code.
import { ApiError } from '../../api/errors';
import { createOutbox, type Attempt, type OutboxDeps } from '../outbox';

/** The storage key the outbox keeps its attempts under. */
const KEY = 'learnloop.outbox.v1';

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

/** The outbox over in-memory storage holding `stored`, a network the test answers, and timers. */
export function rig(stored: string | null = null) {
  const saved = new Map<string, string>(stored === null ? [] : [[KEY, stored]]);
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
  };
  const outbox = createOutbox({
    post,
    storage,
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
