// The active topic (src/feed/useActiveTopic.ts): the topic the feed asks for, kept in async
// storage under `activeTopic` for the user who chose it.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import { signOut, useSession } from '../../auth/useSession';
import { logWarning } from '../../log';
import { useFeedStore } from '../store';
import { cardsByType, makeSet } from '../testing/sets';
import { activeTopic, loadActiveTopic, useActiveTopic } from '../useActiveTopic';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const KEY = 'activeTopic';
const stored = (owner: string | null, slug: string) => JSON.stringify({ owner, slug });

async function startWith(value: string | null, userId: string | null = 'user-1') {
  await AsyncStorage.clear();
  if (value !== null) await AsyncStorage.setItem(KEY, value);
  useSession.setState({ status: userId === null ? 'signedOut' : 'signedIn', userId });
  await loadActiveTopic();
}

beforeEach(() => {
  jest.mocked(logWarning).mockClear();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('loading the active topic', () => {
  it("reads the stored topic of the signed-in user, and the hook's state is loaded", async () => {
    await startWith(stored('user-1', 'strudel'));
    const { result } = renderHook(() => useActiveTopic());

    expect(result.current.slug).toBe('strudel');
    expect(result.current.loaded).toBe(true);
    expect(activeTopic()).toBe('strudel');
  });

  it("reads another user's stored topic as none", async () => {
    await startWith(stored('user-2', 'strudel'));

    expect(activeTopic()).toBeNull();
  });

  it('reads a topic stored without a user when no one is signed in (the demo sets)', async () => {
    await startWith(stored(null, 'strudel'), null);

    expect(activeTopic()).toBe('strudel');
    useSession.setState({ status: 'signedIn', userId: 'user-1' });
    expect(activeTopic()).toBeNull();
  });

  it.each([
    ['not JSON', '{oops'],
    ['a slug the API would refuse', stored('user-1', 'Not A Slug')],
    ['a value of the wrong shape', JSON.stringify(['strudel'])],
  ])('reads %s as none', async (_name, value) => {
    await startWith(value);

    expect(activeTopic()).toBeNull();
    expect(logWarning).toHaveBeenCalledWith('active_topic_invalid', {});
  });

  it('reads a failed storage read as none, and logs it', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await startWith(stored('user-1', 'strudel'));

    expect(activeTopic()).toBeNull();
    expect(logWarning).toHaveBeenCalledWith('active_topic_read_failed', { kind: 'Error' });
  });
});

describe('setting the active topic', () => {
  it('stores it for the signed-in user and starts the feed over', async () => {
    await startWith(null);
    useFeedStore.getState().startSet(makeSet(1, [cardsByType.concept]));
    const { result } = renderHook(() => useActiveTopic());

    await act(() => result.current.setActive('strudel'));

    expect(result.current.slug).toBe('strudel');
    expect(await AsyncStorage.getItem(KEY)).toBe(stored('user-1', 'strudel'));
    expect(useFeedStore.getState().set).toBeNull();
  });

  it('keeps the set in progress when the topic does not change', async () => {
    await startWith(stored('user-1', 'strudel'));
    useFeedStore.getState().startSet(makeSet(1, [cardsByType.concept]));
    const { result } = renderHook(() => useActiveTopic());

    await act(() => result.current.setActive('strudel'));

    expect(useFeedStore.getState().set).not.toBeNull();
  });

  it('keeps the topic for this run when it cannot be stored, and logs it', async () => {
    await startWith(null);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk'));
    const { result } = renderHook(() => useActiveTopic());

    await act(() => result.current.setActive('strudel'));

    expect(result.current.slug).toBe('strudel');
    expect(logWarning).toHaveBeenCalledWith('active_topic_write_failed', { kind: 'Error' });
  });
});

describe('signing out', () => {
  it('forgets the active topic, here and in storage', async () => {
    await startWith(stored('user-1', 'strudel'));

    await signOut();

    expect(activeTopic()).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  it('logs a failure to remove it from storage', async () => {
    await startWith(stored('user-1', 'strudel'));
    useSession.setState({ status: 'signedIn', userId: 'user-1' });
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk'));

    await signOut();
    await act(async () => {
      await Promise.resolve();
    });

    expect(logWarning).toHaveBeenCalledWith('active_topic_remove_failed', { kind: 'Error' });
  });
});
