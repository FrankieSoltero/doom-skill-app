// Signing out clears the feed: the next user of the device never resumes the set, the answers or
// the day's totals of the user who left, however far that user's first set had got.
import { signOut, useSession } from '../../auth/useSession';
import { useFeedStore } from '../store';
import { flush, renderSession } from '../testing/session';
import { cardsByType, makeSet } from '../testing/sets';
import { controlledSource, scriptedSource } from '../testing/sources';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

/** User A's set and user B's set, told apart by their streak. */
const setOfA = makeSet(7, [cardsByType.concept, cardsByType.quiz]);
const setOfB = makeSet(2, [cardsByType.quiz]);

const store = () => useFeedStore.getState();

function signIn(userId: string): void {
  useSession.setState({ status: 'signedIn', userId });
}

beforeEach(() => {
  signIn('user-a');
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

describe('signing out', () => {
  it('leaves the feed store with no set, no answers and no totals', async () => {
    store().startSet(setOfA);
    store().setAnswer(1, { kind: 'choice', picked: 0 });
    store().setIndex(2);
    store().reachSummary();
    expect(store().totals.cards).toBe(2);

    await signOut();

    expect(store()).toMatchObject({
      set: null,
      index: 0,
      answers: {},
      totals: { cards: 0, seconds: 0 },
      streak: 0,
      recordedSummary: null,
    });
  });
});

describe('useFeedSession after a sign-out and a new sign-in', () => {
  it("asks for the new user's first set instead of resuming the set of the user who left", async () => {
    const source = scriptedSource(setOfA, setOfB);
    const first = await renderSession(source);
    expect(first.result.current.set).toEqual(setOfA);
    first.unmount();

    await signOut();
    signIn('user-b');
    const { result } = await renderSession(source);

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    expect(result.current.set).toEqual(setOfB);
  });

  it('drops a set that was asked for before the sign-out and arrives after it', async () => {
    const source = controlledSource();
    const first = await renderSession(source);
    first.unmount();

    await signOut();
    source.resolve(setOfA);
    await flush();
    expect(store().set).toBeNull();

    signIn('user-b');
    const { result } = await renderSession(source);
    source.resolve(setOfB);
    await flush();

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    expect(result.current.set).toEqual(setOfB);
  });
});
