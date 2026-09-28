import { fireEvent, screen, within } from '@testing-library/react-native';

import {
  renderFeed,
  renderWithInsets,
  stubCard,
  stubText,
  TOP_INSET,
} from '../../src/components/testing/feed';
import { HIDDEN, layout, settle } from '../../src/components/testing/pager';
import { viewStyleOf } from '../../src/components/testing/styles';
import { useFeedStore } from '../../src/feed/store';
import { cardsByType, makeSet } from '../../src/feed/testing/sets';
import { controlledSource, scriptedSource } from '../../src/feed/testing/sources';
import { logError } from '../../src/log';
import { colors } from '../../src/theme';
import TodayScreen from '../(tabs)/index';

// The package's own Jest mock: its SafeAreaProvider serves `initialMetrics` from context.
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

jest.mock('../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const { concept, quiz } = cardsByType;
const set = makeSet(12, [concept, quiz]);

beforeEach(() => {
  jest.useFakeTimers();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  jest.mocked(logError).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

/** The Today screen's root: a paper ground, padded by the top inset, in every state. */
function expectRoot(paddingTop: number) {
  expect(viewStyleOf(screen.getByTestId('today-screen'))).toMatchObject({
    flex: 1,
    paddingTop,
    backgroundColor: colors.paper,
  });
}

describe('Today screen states', () => {
  it('shows a loading line a screen reader hears as progress, and no header', async () => {
    await renderFeed(controlledSource());

    const loading = screen.getByTestId('feed-loading');
    expect(loading).toHaveTextContent('Loading…');
    expect(screen.getByRole('progressbar', { name: 'Loading…' })).toBe(loading);
    expect(loading.props).toHaveProperty('accessibilityState', { busy: true });
    expect(screen.queryByTestId('feed-header')).toBeNull();
    expect(screen.queryByTestId('feed-pager')).toBeNull();
    expectRoot(TOP_INSET);
  });

  it('shows the header over the pager once the set loads, with the first card active', async () => {
    await renderFeed(scriptedSource(set), stubCard);
    await layout(700);

    // Queries return elements in tree order.
    const parts = within(screen.getByTestId('today-screen')).getAllByTestId(
      /^feed-(header|pager)$/,
    );
    const order = parts.map((part) => String(part.props.testID));
    expect(order).toStrictEqual(['feed-header', 'feed-pager']);
    expect(screen.queryByTestId('feed-loading')).toBeNull();
    expect(screen.getByText(stubText('concept', 0, true))).toBeOnTheScreen();
    expect(screen.getByText(stubText('quiz', 1, false), HIDDEN)).toBeOnTheScreen();
    expectRoot(TOP_INSET);
  });

  it('shows the load failure with a Retry button that asks the source again', async () => {
    const source = controlledSource();
    await renderFeed(source, stubCard);
    source.reject(new Error('offline'));
    await settle();

    expect(screen.getByTestId('error-screen')).toHaveTextContent("Couldn't load your cards.Retry");
    expectRoot(TOP_INSET);
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await settle();

    expect(source.getNextSet).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('feed-loading')).toBeOnTheScreen();
    source.resolve(set);
    await settle();
    expect(screen.getByTestId('feed-header')).toBeOnTheScreen();
  });

  it('says there is nothing to learn yet, with no button, when the source has no set', async () => {
    await renderFeed(scriptedSource(null));

    const error = screen.getByTestId('error-screen');
    expect(error).toHaveTextContent('Nothing to learn yet.', { exact: true });
    expect(within(error).queryAllByRole('button', HIDDEN)).toHaveLength(0);
    expectRoot(TOP_INSET);
  });
});

describe('Today route', () => {
  it('draws the header and the demo concept card from the app card source', async () => {
    // The route's screen itself, with the real `cardSource`. tabs.test.tsx renders it through
    // the router; importing expo-router/testing-library here would swap Reanimated for its bare
    // mock, which the pager cannot run on.
    await renderWithInsets(<TodayScreen />);
    await layout(700);

    const header = screen.getByTestId('feed-header');
    expect(within(header).getByText('STRUDEL · DAY 4 OF 14')).toBeOnTheScreen();
    expect(within(header).getByText('Today')).toBeOnTheScreen();
    const page = screen.getByTestId('feed-page-0');
    expect(within(page).getByText('Alternate with angle brackets')).toBeOnTheScreen();
    expect(within(page).getByRole('button', { name: 'Got it' })).toBeOnTheScreen();
  });
});
