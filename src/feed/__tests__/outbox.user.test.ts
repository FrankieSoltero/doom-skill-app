// The attempt outbox (src/feed/outbox.ts) keeps each user's attempts apart: under a storage key
// with the user's id, only while that user is signed in. A change of the signed-in user (a
// sign-out, a stored session refused at launch, another user signing in) drops the queue in
// memory and removes every other user's stored attempts, so none is ever posted under another
// account. Nothing leaves the test.
import { logWarning } from '../../log';
import {
  LOADING,
  SIGNED_OUT,
  USER,
  attempt,
  fakeSession,
  keyOf,
  offline,
  rig,
  settle,
  signedIn,
} from '../testing/outbox';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const LEGACY_KEY = 'doomskill.outbox.v1';

/** What an earlier run left for `user`: one attempt, with its client id. */
const leftFor = (user: string) => JSON.stringify([{ ...attempt(9), clientAttemptId: `${user}-9` }]);

afterEach(() => {
  jest.clearAllMocks();
});

describe('with no user signed in', () => {
  it.each([
    ['while the session is read', LOADING],
    ['when signed out', SIGNED_OUT],
  ])('is inert %s: it keeps, stores and posts nothing', async (_case, state) => {
    const box = rig(null, { session: fakeSession(state) });

    box.outbox.add(attempt(1));
    await box.outbox.flush();
    await settle();

    expect(box.outbox.pending()).toBe(0);
    expect(box.post).not.toHaveBeenCalled();
    expect(box.storage.setItem).not.toHaveBeenCalled();
  });
});

describe("the signed-in user's queue", () => {
  it("is kept under a key with the user's id", async () => {
    const box = rig();
    box.answers.push(offline());

    box.outbox.add(attempt(1));
    await settle();

    expect([...box.saved.keys()]).toStrictEqual([keyOf(USER)]);
    expect(box.kept().map((kept) => kept.clientAttemptId)).toStrictEqual(['id-1']);
  });

  it('is sent when the same user is signed in again at the next launch', async () => {
    const session = fakeSession(LOADING);
    const box = rig(leftFor(USER), { session });
    await settle();
    expect(box.post).not.toHaveBeenCalled();

    session.set(signedIn(USER));
    await settle();

    expect(box.sent()).toStrictEqual([`${USER}-9`]);
  });
});

describe('a change of the signed-in user', () => {
  it('on sign-out drops the queue, its stored key and its retry', async () => {
    const box = rig();
    box.answers.push(offline());
    box.outbox.add(attempt(1));
    await settle();
    expect(box.live()).toHaveLength(1);

    box.session.set(SIGNED_OUT);
    await settle();

    expect(box.outbox.pending()).toBe(0);
    expect(box.saved.has(keyOf(USER))).toBe(false);
    expect(box.live()).toStrictEqual([]);
  });

  it("when another user signs in, never posts the first user's attempts", async () => {
    const box = rig();
    box.answers.push(offline());
    box.outbox.add(attempt(1));
    await settle();

    box.session.set(signedIn('user-2'));
    box.outbox.add(attempt(2));
    await settle();

    expect(box.sent()).toStrictEqual(['id-1', 'id-2']);
    expect(box.post.mock.calls.map(([sent]) => sent.cardId)).toStrictEqual([
      attempt(1).cardId,
      attempt(2).cardId,
    ]);
    expect(box.saved.has(keyOf(USER))).toBe(false);
    expect(box.outbox.pending()).toBe(0);
  });

  it('a session refused at launch, then another user: the first user is never posted', async () => {
    const saved = new Map([
      [keyOf(USER), leftFor(USER)],
      [LEGACY_KEY, leftFor('unknown')],
      ['doomskill.other', 'kept'],
    ]);
    const session = fakeSession(LOADING);
    const box = rig(null, { session, saved });

    session.set(SIGNED_OUT);
    await settle();
    session.set(signedIn('user-2'));
    box.outbox.add(attempt(2));
    await settle();

    expect(box.sent()).toStrictEqual(['id-1']);
    expect([...saved.keys()].sort()).toStrictEqual(['doomskill.other', keyOf('user-2')]);
  });

  it('stops a flush that was sending the first user attempts', async () => {
    const box = rig();
    let release: () => void = () => undefined;
    box.post.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    box.outbox.add(attempt(1));
    box.outbox.add(attempt(2));
    await settle();

    box.session.set(signedIn('user-2'));
    release();
    await settle();

    expect(box.sent()).toStrictEqual(['id-1']);
    expect(box.outbox.pending()).toBe(0);
  });

  it('logs a storage that cannot list its keys, and goes on', async () => {
    const box = rig();
    box.storage.getAllKeys.mockRejectedValueOnce(new Error('keys'));

    box.session.set(signedIn('user-2'));
    await settle();
    box.outbox.add(attempt(1));
    await settle();

    expect(jest.mocked(logWarning)).toHaveBeenCalledWith('outbox_sweep_failed', { kind: 'Error' });
    expect(box.sent()).toStrictEqual(['id-1']);
  });
});
