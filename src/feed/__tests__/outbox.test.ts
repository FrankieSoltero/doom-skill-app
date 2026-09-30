// The attempt outbox (src/feed/outbox.ts): adding and sending attempts. The network, the storage
// and the timers are the test's own (src/feed/testing/outbox.ts); nothing leaves the test.
import { ApiError } from '../../api/errors';
import { logWarning } from '../../log';
import { attempt, offline, rig, settle } from '../testing/outbox';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
});

describe('add', () => {
  it('gives the attempt a client id, stores it, and posts it', async () => {
    const box = rig();
    box.answers.push(offline());

    box.outbox.add(attempt(1));
    expect(box.outbox.pending()).toBe(1);
    await settle();

    expect(box.post.mock.calls).toStrictEqual([[{ ...attempt(1), clientAttemptId: 'id-1' }]]);
    expect(box.kept()).toStrictEqual([{ ...attempt(1), clientAttemptId: 'id-1' }]);
  });

  it('cuts exercise code to 5,000 characters, never inside a character', async () => {
    const box = rig();
    const long = `${'a'.repeat(4_999)}🎵${'b'.repeat(10)}`;
    box.outbox.add(attempt(1, { code: 'c'.repeat(6_000) }));
    box.outbox.add(attempt(2, { code: long }));
    await settle();

    const codes = box.post.mock.calls.map(([sent]) => (sent.response as { code: string }).code);
    expect(codes).toStrictEqual(['c'.repeat(5_000), `${'a'.repeat(4_999)}🎵`]);
  });

  it('keeps at most 200 attempts, dropping the oldest and logging it', async () => {
    const box = rig();
    box.answers.push(...Array.from({ length: 300 }, offline));

    for (let n = 1; n <= 201; n += 1) box.outbox.add(attempt(n));
    await settle();

    expect(box.outbox.pending()).toBe(200);
    expect(box.kept()[0]?.clientAttemptId).toBe('id-2');
    expect(jest.mocked(logWarning)).toHaveBeenCalledWith('attempt_dropped', { kind: 'full' });
  });
});

describe('flush', () => {
  it('posts in order, one at a time, and a 200 removes each', async () => {
    const box = rig();
    box.outbox.add(attempt(1));
    box.outbox.add(attempt(2));
    box.outbox.add(attempt(3));
    await settle();

    expect(box.sent()).toStrictEqual(['id-1', 'id-2', 'id-3']);
    expect(box.outbox.pending()).toBe(0);
    expect(box.kept()).toStrictEqual([]);
    expect(box.live()).toStrictEqual([]);
  });

  it.each([
    [404, 'notFound'],
    [409, 'conflict'],
    [422, 'invalid'],
  ] as const)(
    'removes an attempt the API answers %i to, and logs the kind',
    async (status, kind) => {
      const box = rig();
      box.answers.push(new ApiError(kind, status));
      box.outbox.add(attempt(1, { code: 'secret-marker' }));
      box.outbox.add(attempt(2));
      await settle();

      expect(box.sent()).toStrictEqual(['id-1', 'id-2']);
      expect(box.outbox.pending()).toBe(0);
      expect(jest.mocked(logWarning)).toHaveBeenCalledWith('attempt_dropped', { kind, status });
      expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
    },
  );

  it.each([
    ['offline', offline()],
    ['a 401 the refresh did not fix', new ApiError('unauthorized', 401)],
    ['a 503', new ApiError('unavailable', 503)],
    ['a 500', new ApiError('server', 500)],
    ['a 429', new ApiError('rateLimited', 429)],
    ['an answer that is not JSON', new SyntaxError('secret-marker')],
  ])('keeps the attempt, and the ones after it, for %s', async (_case, error) => {
    const box = rig();
    box.answers.push(error);
    box.outbox.add(attempt(1, { code: 'secret-marker' }));
    box.outbox.add(attempt(2));
    await settle();

    expect(box.sent()).toStrictEqual(['id-1']);
    expect(box.outbox.pending()).toBe(2);
    expect(box.kept().map((kept) => kept.clientAttemptId)).toStrictEqual(['id-1', 'id-2']);
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });

  it('tries again after 5 s, 30 s, then every 2 minutes, and from 5 s after progress', async () => {
    const box = rig();
    box.answers.push(offline(), offline(), offline(), offline(), null, offline());
    box.outbox.add(attempt(1));
    await settle();

    const waits: number[] = [];
    for (let retry = 0; retry < 4; retry += 1) {
      waits.push(box.live()[0]?.ms ?? -1);
      await box.fire();
    }
    expect(waits).toStrictEqual([5_000, 30_000, 120_000, 120_000]);
    expect(box.outbox.pending()).toBe(0);

    box.outbox.add(attempt(2));
    await settle();
    expect(box.live().map((timer) => timer.ms)).toStrictEqual([5_000]);
  });
});

describe('flush when asked', () => {
  it('tries at once, as when the app returns to the foreground', async () => {
    const box = rig();
    box.answers.push(offline());
    box.outbox.add(attempt(1));
    await settle();
    expect(box.live()).toHaveLength(1);

    await box.outbox.flush();

    expect(box.sent()).toStrictEqual(['id-1', 'id-1']);
    expect(box.outbox.pending()).toBe(0);
    expect(box.live()).toStrictEqual([]);
  });

  it('joins a flush already running', async () => {
    const box = rig();
    box.outbox.add(attempt(1));

    await Promise.all([box.outbox.flush(), box.outbox.flush()]);

    expect(box.sent()).toStrictEqual(['id-1']);
  });
});
