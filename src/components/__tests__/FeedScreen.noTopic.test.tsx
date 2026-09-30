// The Today screen when the learner has no active topic: the API source fails with kind `noTopic`
// before asking the server, and the screen shows a fixed message with a way to Explore.
import { fireEvent, screen } from '@testing-library/react-native';

import { FeedLoadError } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { scriptedSource } from '../../feed/testing/sources';
import { logError } from '../../log';
import { FeedScreen } from '../FeedScreen';
import { renderFeed, renderWithInsets } from '../testing/feed';

jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const NO_TOPIC = 'Pick a topic to start learning.';
const EXPLORE = 'Explore topics';
const noTopic = () => new FeedLoadError('No active topic', { kind: 'noTopic' });

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

beforeEach(() => {
  jest.useFakeTimers();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('FeedScreen with no active topic', () => {
  it('shows the fixed message and a button to Explore, and logs no failure', async () => {
    const onExplore = jest.fn();
    await renderWithInsets(<FeedScreen source={scriptedSource(noTopic())} onExplore={onExplore} />);

    expect(screen.getByTestId('error-message')).toHaveTextContent(NO_TOPIC);
    fireEvent.press(screen.getByRole('button', { name: EXPLORE }));
    expect(onExplore).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it('shows the load failure with Retry for any other failure, as before', async () => {
    const other = new FeedLoadError('Feed request failed: offline', { kind: 'offline' });
    const source = scriptedSource(other, makeSet(1, [cardsByType.concept]));
    await renderFeed(source);

    expect(screen.getByTestId('error-message')).toHaveTextContent("Couldn't load your cards.");
    expect(screen.queryByRole('button', { name: EXPLORE })).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('asks again on return to a remounted screen, once a topic is chosen', async () => {
    const source = scriptedSource(noTopic(), makeSet(1, [cardsByType.concept]));
    await renderFeed(source);
    expect(screen.getByTestId('error-message')).toHaveTextContent(NO_TOPIC);

    screen.unmount();
    await renderFeed(source);

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('feed-header')).toBeOnTheScreen();
  });
});
