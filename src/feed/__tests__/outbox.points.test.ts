// The points each attempt's reply carries settle in the feed store (`settle`), replacing the card's
// provisional value, and add up in `pointsEarned`, which the Summary card shows for the set
// (src/feed/outbox.ts, src/feed/store.ts). Only a reply adds: a dropped attempt (404, 409, 422)
// settles at 0, one waiting for a retry stays provisional, and a reply without `points` (an older
// server) reads as 0. A reply whose grade differs from the app's is logged as `attempt_regraded`.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '../../api/errors';
import type { FeedSet } from '../../data';
import { json, network } from '../../data/testing/network';
import { logWarning } from '../../log';
import { createOutbox, type GradedReply } from '../outbox';
import { useFeedStore } from '../store';
import { attempt, fakeSession, offline, settle, signedIn, USER } from '../testing/outbox';
import { cardsByType, makeSet } from '../testing/sets';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

/** A reply that earned `points` and offers no follow-up. */
const earned = (points: number, correct: boolean | null = null): GradedReply => ({
  followUp: null,
  points,
  correct,
});

/** An outbox whose post answers the attempts in order: a reply, or the error it rejects with. */
function outboxAnswering(...answers: (GradedReply | ApiError)[]) {
  let made = 0;
  return createOutbox({
    post: (): Promise<GradedReply> => {
      const answer = answers.shift() ?? offline();
      return answer instanceof ApiError ? Promise.reject(answer) : Promise.resolve(answer);
    },
    storage: AsyncStorage,
    session: fakeSession(signedIn(USER)),
    schedule: () => () => undefined,
    newId: () => `id-${String((made += 1))}`,
  });
}

/** Adds an attempt at cards 1 to `count` and lets the outbox send them. */
async function answerCards(outbox: ReturnType<typeof outboxAnswering>, count: number) {
  for (let n = 1; n <= count; n += 1) outbox.add(attempt(n));
  await settle();
}

beforeEach(async () => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logWarning).mockClear();
  await AsyncStorage.clear();
});

const CARD_1 = attempt(1).cardId;
const regraded = () => jest.mocked(logWarning).mock.calls.filter(([e]) => e === 'attempt_regraded');

describe('a reply settles the provisional value of its card', () => {
  it('replaces +5 with the reply of 5: settled 5, nothing pending', async () => {
    useFeedStore.getState().addProvisional(CARD_1, 5, { kind: 'quiz', correct: true });

    await answerCards(outboxAnswering(earned(5, true)), 1);

    expect(useFeedStore.getState().settledPoints).toBe(5);
    expect(useFeedStore.getState().pendingCount).toBe(0);
    expect(regraded()).toHaveLength(0);
  });

  it('settles to the reply of 1 when the server grades a local right answer wrong, logged once', async () => {
    useFeedStore.getState().addProvisional(CARD_1, 5, { kind: 'quiz', correct: true });

    await answerCards(outboxAnswering(earned(1, false)), 1);

    expect(useFeedStore.getState().pointsEarned).toBe(1);
    expect(regraded()).toStrictEqual([['attempt_regraded', { kind: 'quiz' }]]);
  });

  it('settles a replay (a timeout, then the retry) that echoes its original 5', async () => {
    useFeedStore.getState().addProvisional(CARD_1, 5, { kind: 'quiz', correct: true });
    const outbox = outboxAnswering(offline(), earned(5, true));

    await answerCards(outbox, 1);
    await outbox.flush();

    expect(useFeedStore.getState().settledPoints).toBe(5);
    expect(useFeedStore.getState().pendingCount).toBe(0);
    expect(useFeedStore.getState().pointsEarned).toBe(5);
  });

  it('settles a refused attempt at 0, so nothing stays pending', async () => {
    useFeedStore.getState().addProvisional(CARD_1, 5, { kind: 'quiz', correct: true });

    await answerCards(outboxAnswering(new ApiError('conflict', 409)), 1);

    expect(useFeedStore.getState().pointsEarned).toBe(0);
    expect(useFeedStore.getState().pendingCount).toBe(0);
    expect(regraded()).toHaveLength(0);
  });

  it('keeps the value provisional while the attempt waits for a retry', async () => {
    useFeedStore.getState().addProvisional(CARD_1, 5, { kind: 'quiz', correct: true });

    await answerCards(outboxAnswering(offline()), 1);

    expect(useFeedStore.getState().pointsEarned).toBe(5);
    expect(useFeedStore.getState().pendingCount).toBe(1);
  });
});

describe('the outbox and the points earned', () => {
  it('adds the points of every reply: 2, 0 and 1 make 3', async () => {
    const outbox = outboxAnswering(earned(2), earned(0), earned(1));

    await answerCards(outbox, 3);

    expect(outbox.pending()).toBe(0);
    expect(useFeedStore.getState().pointsEarned).toBe(3);
  });

  it('adds nothing for a dropped attempt (404, 409, 422)', async () => {
    const outbox = outboxAnswering(
      new ApiError('notFound', 404),
      earned(2),
      new ApiError('conflict', 409),
      new ApiError('invalid', 422),
    );

    await answerCards(outbox, 4);

    expect(outbox.pending()).toBe(0);
    expect(useFeedStore.getState().pointsEarned).toBe(2);
  });

  it('adds nothing for an attempt kept for a retry', async () => {
    const outbox = outboxAnswering(offline());

    await answerCards(outbox, 1);

    expect(outbox.pending()).toBe(1);
    expect(useFeedStore.getState().pointsEarned).toBe(0);
  });
});

const CARD_ID = '00000000-0000-4000-8000-000000000031';
const SERVED: FeedSet = {
  ...makeSet(0, [{ ...cardsByType.quiz, id: CARD_ID }]),
  feedDate: '2026-10-07',
  setNumber: 1,
};

/** The session of the app loaded last, signed out after each case so no retry outlives it. */
let session: typeof import('../../auth/useSession').useSession | undefined;

/**
 * The app's feed store, its outbox installed as the sink, loaded afresh over the real API client
 * on a fake network that answers the one attempt with `answer`: nothing leaves the test.
 */
function appAnswering(answer: Response) {
  const { api, requests } = network(answer);
  let store: typeof useFeedStore | undefined;
  jest.isolateModules(() => {
    jest.doMock('../../api/client', () => ({
      ...jest.requireActual<typeof import('../../api/client')>('../../api/client'),
      api,
    }));
    jest.requireActual<typeof import('../outbox')>('../outbox');
    store = jest.requireActual<typeof import('../store')>('../store').useFeedStore;
    session =
      jest.requireActual<typeof import('../../auth/useSession')>(
        '../../auth/useSession',
      ).useSession;
  });
  if (store === undefined || session === undefined) throw new Error('the app did not load');
  session.setState({ status: 'signedIn', userId: USER });
  return { store, requests };
}

describe("the app outbox reads the reply's points", () => {
  afterEach(() => {
    session?.setState({ status: 'signedOut', userId: null });
    session = undefined;
  });

  it.each([
    ['the points the reply carries', { correct: true, follow_up: null, points: 2 }, 2],
    ['0 for a reply without points (an older server)', { correct: true, follow_up: null }, 0],
  ])('adds %s', async (_case, body, expected) => {
    const { store, requests } = appAnswering(json(200, body));

    store.getState().startSet(SERVED);
    store.getState().setAnswer(0, { kind: 'choice', picked: 1 });
    await settle();

    expect(requests).toStrictEqual([`/cards/${CARD_ID}/attempt`]);
    expect(store.getState().pointsEarned).toBe(expected);
  });
});
