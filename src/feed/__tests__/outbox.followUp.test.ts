// The attempt outbox hands the follow-up the server offers after a wrong answer to the installed
// sink (src/feed/outbox.ts, src/feed/followUp.ts): after a 2xx only, never at the cost of the
// attempt. The app's outbox installs `placeFollowUp`, so the card lands in the running set.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Card, FeedSet } from '../../data';
import { json } from '../../data/testing/network';
import { logWarning } from '../../log';
import { installFollowUpSink } from '../followUp';
import { createOutbox, type AttemptReply, type OutboxDeps } from '../outbox';
import { attempt, fakeSession, rig, settle, signedIn, USER } from '../testing/outbox';
import { cardsByType, makeSet } from '../testing/sets';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const followUp: Card = { ...cardsByType.predict, id: '00000000-0000-4000-8000-000000000009' };

/** An outbox whose post answers every attempt with `reply`, and the retries it scheduled. */
function boxAnswering(reply: () => Promise<AttemptReply>) {
  const post = jest.fn<ReturnType<OutboxDeps['post']>, Parameters<OutboxDeps['post']>>(reply);
  const schedule = jest.fn(() => () => undefined);
  const outbox = createOutbox({
    post,
    storage: AsyncStorage,
    session: fakeSession(signedIn(USER)),
    schedule,
    newId: () => 'id-1',
  });
  return { outbox, post, schedule };
}

beforeEach(async () => {
  installFollowUpSink(null);
  jest.mocked(logWarning).mockClear();
  await AsyncStorage.clear();
});

describe('the outbox and the follow-up', () => {
  it("calls the installed sink with the follow-up and the attempt's card, date and set", async () => {
    const sink = jest.fn();
    installFollowUpSink(sink);
    const box = boxAnswering(() => Promise.resolve({ followUp, points: 0 }));

    box.outbox.add(attempt(1));
    await settle();

    expect(sink.mock.calls).toStrictEqual([
      [
        {
          card: followUp,
          afterCardId: attempt(1).cardId,
          feedDate: '2026-10-01',
          setNumber: 1,
        },
      ],
    ]);
    expect(box.outbox.pending()).toBe(0);
  });

  it('calls no sink for a reply with no follow-up, or a post that resolves nothing', async () => {
    const sink = jest.fn();
    installFollowUpSink(sink);
    const box = boxAnswering(() => Promise.resolve({ followUp: null, points: 0 }));
    const old = rig();

    box.outbox.add(attempt(1));
    old.outbox.add(attempt(2));
    await settle();

    expect(sink).not.toHaveBeenCalled();
    expect(box.outbox.pending()).toBe(0);
    expect(old.outbox.pending()).toBe(0);
  });

  it('skips the follow-up with no installed sink (the demo), and the attempt is sent', async () => {
    const box = boxAnswering(() => Promise.resolve({ followUp, points: 0 }));

    box.outbox.add(attempt(1));
    await settle();

    expect(box.outbox.pending()).toBe(0);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('treats the attempt as sent when the sink throws: no re-post, no retry, logged by class', async () => {
    installFollowUpSink(() => {
      throw new TypeError('secret-marker');
    });
    const box = boxAnswering(() => Promise.resolve({ followUp, points: 0 }));

    box.outbox.add(attempt(1));
    box.outbox.add(attempt(2));
    await settle();

    expect(box.post).toHaveBeenCalledTimes(2);
    expect(box.outbox.pending()).toBe(0);
    expect(box.schedule).not.toHaveBeenCalled();
    expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', {
      reason: 'failed',
      kind: 'TypeError',
    });
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('secret-marker');
  });
});

const ids = (n: number) => `00000000-0000-4000-8000-00000000010${String(n)}`;

const SET: FeedSet = {
  ...makeSet(0, [
    { ...cardsByType.quiz, id: ids(1) },
    { ...cardsByType.concept, id: ids(2) },
    { ...cardsByType.concept, id: ids(3) },
  ]),
  setNumber: 2,
  feedDate: '2026-10-05',
};

/** The follow-up of the attempt's reply as the API serves it: snake_case keys. */
const OFFERED = {
  id: ids(9),
  type: 'concept',
  node: 'Rests',
  est_seconds: 20,
  title: 'A rest keeps its step',
  body: 'The **~** step is silent.',
  snippet: 's("bd ~")',
  snippet_comment: '',
  cycles: [],
};

/** The session of the case running, signed out after it so no retry timer outlives the case. */
let running: typeof import('../../auth/useSession').useSession | undefined;

/**
 * The app's outbox and feed store, loaded afresh, the API client over a fake network that answers
 * the one attempt with `answer` (src/data/testing/network.ts): nothing leaves the test.
 */
function loadApp(answer: Response) {
  const loaded: {
    outbox?: typeof import('../outbox').outbox;
    store?: typeof import('../store').useFeedStore;
  } = {};
  jest.isolateModules(() => {
    // The fake network loads the real client first; the outbox then gets one built over it.
    jest.dontMock('../../api/client');
    const testing = jest.requireActual<typeof import('../../data/testing/network')>(
      '../../data/testing/network',
    );
    const { api } = testing.network(answer);
    jest.doMock('../../api/client', () => ({
      ...jest.requireActual<typeof import('../../api/client')>('../../api/client'),
      api,
    }));
    loaded.outbox = jest.requireActual<typeof import('../outbox')>('../outbox').outbox;
    loaded.store = jest.requireActual<typeof import('../store')>('../store').useFeedStore;
    running =
      jest.requireActual<typeof import('../../auth/useSession')>(
        '../../auth/useSession',
      ).useSession;
  });
  const { outbox, store } = loaded;
  if (outbox === undefined || store === undefined || running === undefined) {
    throw new Error('the app modules did not load');
  }
  running.setState({ status: 'signedIn', userId: USER });
  return { outbox, store };
}

const reply = (followUpBody: unknown) => json(200, { correct: false, follow_up: followUpBody });

describe('the app outbox', () => {
  afterEach(() => {
    running?.setState({ status: 'signedOut', userId: null });
    running = undefined;
  });

  it('places the follow-up the API offers two cards after the answered card', async () => {
    const app = loadApp(reply(OFFERED));

    app.store.getState().startSet(SET);
    app.store.getState().setAnswer(0, { kind: 'choice', picked: 1 });
    await settle();

    expect(app.store.getState().set?.cards.map((card) => card.id)).toStrictEqual([
      ids(1),
      ids(2),
      ids(9),
      ids(3),
    ]);
    expect(app.store.getState().set?.cards[2]).toMatchObject({ estSeconds: 20, type: 'concept' });
  });

  it('drops a follow-up it cannot read, logged, and the attempt is sent', async () => {
    const app = loadApp(reply({ ...OFFERED, title: '' }));

    app.store.getState().startSet(SET);
    app.store.getState().setAnswer(0, { kind: 'choice', picked: 1 });
    await settle();

    expect(app.store.getState().set?.cards).toHaveLength(3);
    expect(logWarning).toHaveBeenCalledWith('follow_up_dropped', { reason: 'unparsable' });
    expect(app.outbox.pending()).toBe(0);
  });
});
