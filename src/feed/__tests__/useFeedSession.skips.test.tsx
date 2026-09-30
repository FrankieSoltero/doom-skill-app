// The feed session records each card the source dropped from a set (`droppedIds`) as skipped, as
// soon as the set is served, so the server can finish the set: even a set with no card left to
// show, which the session does not start.
import type { FeedSet } from '../../data';
import type { Attempt } from '../outbox';
import { sendAttemptsTo, useFeedStore } from '../store';
import { renderSession } from '../testing/session';
import { cardsByType, makeSet } from '../testing/sets';
import { scriptedSource } from '../testing/sources';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const DROPPED = ['00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000008'];
const add = jest.fn<undefined, [Attempt]>();

/** A set from the API, stored for 1 October, set 2, with two cards dropped. */
function apiSet(cards: FeedSet['cards']): FeedSet {
  return { ...makeSet(0, cards), setNumber: 2, feedDate: '2026-10-01', droppedIds: DROPPED };
}

const skip = (cardId: string): Attempt => ({
  cardId,
  response: { skipped: true },
  durationMs: 0,
  feedDate: '2026-10-01',
  setNumber: 2,
});

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  add.mockReset();
  sendAttemptsTo({ add });
});

afterEach(() => {
  sendAttemptsTo(null);
});

describe('useFeedSession: the cards the source dropped', () => {
  it('records each as skipped when the set is served', async () => {
    await renderSession(scriptedSource(apiSet([cardsByType.quiz])));

    expect(add.mock.calls).toStrictEqual([[skip(DROPPED[0] ?? '')], [skip(DROPPED[1] ?? '')]]);
    expect(useFeedStore.getState().set?.cards).toHaveLength(1);
  });

  it('records them even when no card of the set is left to show', async () => {
    const { result } = await renderSession(scriptedSource(apiSet([])));

    expect(add).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('empty');
  });
});
