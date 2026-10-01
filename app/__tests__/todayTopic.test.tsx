// The Today route (app/(tabs)/index.tsx) and the active topic: it waits for the stored topic, and
// starts the feed again when the active topic changes. The card source is the app's, spied.
import { act, render, renderHook, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '../../src/auth/useSession';
import { cardSource } from '../../src/data';
import { useFeedStore } from '../../src/feed/store';
import { cardsByType, makeSet } from '../../src/feed/testing/sets';
import { loadActiveTopic, useActiveTopic } from '../../src/feed/useActiveTopic';
import TodayScreen from '../(tabs)/index';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

beforeEach(async () => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  useSession.setState({ status: 'signedOut', userId: null });
  await loadActiveTopic();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Today and the active topic', () => {
  it('starts the feed again, from a fresh set, when the active topic changes', async () => {
    const getNextSet = jest
      .spyOn(cardSource, 'getNextSet')
      .mockResolvedValue(makeSet(1, [cardsByType.concept]));
    // Before the screen: `screen` reads the last tree rendered.
    const { result } = renderHook(() => useActiveTopic());
    render(
      <SafeAreaProvider>
        <TodayScreen />
      </SafeAreaProvider>,
    );
    await screen.findByTestId('feed-header');
    expect(getNextSet).toHaveBeenCalledTimes(1);

    await act(() => result.current.setActive('rust-ownership'));

    await screen.findByTestId('feed-header');
    expect(getNextSet).toHaveBeenCalledTimes(2);
  });

  it('shows only the paper ground, and asks for no set, until the stored topic is read', () => {
    jest.isolateModules(() => {
      // A fresh copy of the app, React and the testing library, so the active topic is read anew;
      // the read never finishes.
      type Storage = { getItem: () => Promise<string | null> };
      const loaded = jest.requireActual<Storage & { default?: Storage }>(
        '@react-native-async-storage/async-storage',
      );
      const storage = loaded.default ?? loaded;
      jest.spyOn(storage, 'getItem').mockReturnValue(new Promise(() => undefined));
      const fresh = {
        // The `pure` entry: the main one registers Jest hooks, which a test cannot do.
        rntl: jest.requireActual<typeof import('@testing-library/react-native/pure')>(
          '@testing-library/react-native/pure',
        ),
        react: jest.requireActual<typeof import('react')>('react'),
        data: jest.requireActual<typeof import('../../src/data')>('../../src/data'),
        Today: jest.requireActual<typeof import('../(tabs)/index')>('../(tabs)/index').default,
      };
      const getNextSet = jest.spyOn(fresh.data.cardSource, 'getNextSet');

      // Queried through the fresh copy's own result: the matchers read the outer copy's screen.
      const view = fresh.rntl.render(fresh.react.createElement(fresh.Today));

      expect(view.queryByTestId('today-waiting')).not.toBeNull();
      expect(view.queryByTestId('today-screen')).toBeNull();
      expect(getNextSet).not.toHaveBeenCalled();
      fresh.rntl.cleanup();
    });
  });
});
