// The Today screen offline (offline-topic plan Task 6, O2): when the server cannot be reached and
// every kept set is answered, the end card shows in place of the load failure; Retry serves the
// server's set once it answers.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import { useSession } from '../../auth/useSession';
import { FeedLoadError } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { scriptedSource } from '../../feed/testing/sources';
import { loadActiveTopic, switchTo } from '../../feed/useActiveTopic';
import { logError } from '../../log';
import { renderFeed } from '../testing/feed';
import { settle } from '../testing/pager';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const offline = () => new FeedLoadError('Feed request failed: offline', { kind: 'offline' });

beforeEach(async () => {
  await AsyncStorage.clear();
  await loadActiveTopic();
  useSession.setState({ status: 'signedIn', userId: 'user-1' });
  await switchTo('strudel');
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
});

describe('FeedScreen offline with no kept set left', () => {
  it('shows the end card, not the load failure, and Retry loads the set once online', async () => {
    const source = scriptedSource(offline(), makeSet(1, [cardsByType.concept]));
    await renderFeed(source);

    expect(screen.getByTestId('connect-card')).toBeOnTheScreen();
    expect(screen.getByTestId('error-message')).toHaveTextContent('Connect to get more cards');
    expect(screen.queryByText("Couldn't load your cards.")).toBeNull();
    expect(logError).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await settle();

    expect(screen.queryByTestId('connect-card')).toBeNull();
    expect(screen.getByTestId('feed-header')).toBeOnTheScreen();
  });
});
