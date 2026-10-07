import { render } from '@testing-library/react-native';
import { MessageCircle } from 'lucide-react-native';
import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { json, queryWrapper, serveApi } from '../../src/api/testing/fakeApi';
import { openSkillTree } from '../../src/components/FeedScreen';
import { textStyleOf, viewStyleOf } from '../../src/components/testing/styles';
import { cardSource, FeedLoadError } from '../../src/data';
import { useFeedStore } from '../../src/feed/store';
import * as inboxModule from '../../src/qa/useInbox';
import { cardsByType, makeSet } from '../../src/feed/testing/sets';
import { colors } from '../../src/theme';
import TabsLayout from '../(tabs)/_layout';
import ExploreScreen from '../(tabs)/explore';
import TodayScreen from '../(tabs)/index';
import ProfileScreen from '../(tabs)/profile';
import QuestionsScreen from '../(tabs)/questions';
import TreeScreen from '../(tabs)/tree';

// The package's own Jest mock: its SafeAreaProvider serves `initialMetrics` from context, with
// no native module.
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

// The shell tests do not need cards. The shared source's answer never arrives, so the Today tab
// stays in its loading state and nothing updates after a test ends; the test that looks at the
// loaded Today screen gives it a set. The tab bar's inbox stays loading too, for the same reason
// (with no API client its read would fail after the test); the tests that look at its badge read
// it over a fake network.
let getNextSet: jest.SpiedFunction<typeof cardSource.getNextSet>;
let useInbox: jest.SpiedFunction<typeof inboxModule.useInbox>;

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  getNextSet = jest.spyOn(cardSource, 'getNextSet').mockReturnValue(new Promise(() => undefined));
  useInbox = jest.spyOn(inboxModule, 'useInbox').mockReturnValue({
    status: 'loading',
    retry: () => undefined,
    badge: 0,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The tab routes as Expo Router reads them from `app/`. */
const ROUTES = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': TodayScreen,
  '(tabs)/tree': TreeScreen,
  '(tabs)/explore': ExploreScreen,
  '(tabs)/questions': QuestionsScreen,
  '(tabs)/profile': ProfileScreen,
};

/** The other tab screens, each with its root's test id. */
const SCREENS = [
  { path: '/tree', tab: 'Tree', testID: 'tree-screen' },
  { path: '/explore', tab: 'Explore', testID: 'explore-screen' },
  { path: '/profile', tab: 'Profile', testID: 'profile-screen' },
];

/** Renders the tab routes at `initialUrl`, with a fresh server-state cache. */
function renderTabs(initialUrl: string) {
  return renderRouter(ROUTES, { initialUrl, wrapper: queryWrapper().wrapper });
}

/** An inbox with nothing in it and `badge` new items. */
const inbox = (badge: number) => json(200, { to_answer: [], answered: [], badge });

/**
 * Renders the tab routes at `initialUrl` over a fake network whose inbox gives `badge`, and waits
 * for the tab bar's inbox to load. Returns the router and the requests the network was sent.
 */
async function renderWithInbox(badge: number, initialUrl = '/') {
  useInbox.mockRestore();
  const requests = serveApi({
    'GET /questions/inbox': [inbox(badge)],
    'POST /questions/inbox/seen': [new Response(null, { status: 204 })],
  });
  const { client, wrapper } = queryWrapper();
  const router = renderRouter(ROUTES, { initialUrl, wrapper });
  await waitFor(() => {
    expect(client.getQueryState(['inbox'])?.status).toBe('success');
  });
  return { router, requests };
}

const TOP_INSET = 47;

/** Renders `Screen` alone, under a safe area whose top inset is 47 (the reference device's). */
function renderWithTopInset(Screen: ComponentType) {
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: TOP_INSET, right: 0, bottom: 34, left: 0 },
  };
  const { wrapper: Cache } = queryWrapper();
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Cache>
        <Screen />
      </Cache>
    </SafeAreaProvider>,
  );
}

describe('tab routes', () => {
  it('renders the Today screen at /', async () => {
    getNextSet.mockResolvedValueOnce(makeSet(12, [cardsByType.concept]));
    const router = renderTabs('/');

    expect(router.getPathname()).toBe('/');
    const header = await screen.findByTestId('feed-header');
    const today = screen.getByTestId('today-screen');
    expect(within(today).getByText('Today')).toBeOnTheScreen();
    expect(within(today).getByTestId('feed-header')).toBe(header);
  });

  it('draws the tab bar with no navigation header above the screen', () => {
    renderTabs('/');

    expect(screen.getByTestId('tab-bar')).toBeOnTheScreen();
    // React Navigation's header draws the screen title as a heading; the Today screen has none.
    expect(screen.queryAllByRole('heading', { includeHiddenElements: true })).toHaveLength(0);
  });

  it('orders the tabs Today, Tree, Explore, Questions, Profile, with Today selected at /', () => {
    renderTabs('/');

    const tabs = screen.getAllByRole('tab');
    ['Today', 'Tree', 'Explore', 'Questions', 'Profile'].forEach((name, position) => {
      expect(tabs[position]).toBe(screen.getByRole('tab', { name }));
    });
    expect(tabs).toHaveLength(5);
    expect(screen.getByRole('tab', { name: 'Today' })).toBeSelected();
  });

  it.each(SCREENS)('pressing the $tab tab renders its screen at $path', ({ path, tab, testID }) => {
    const router = renderTabs('/');

    fireEvent.press(screen.getByRole('tab', { name: tab }));

    expect(router.getPathname()).toBe(path);
    expect(screen.getByRole('tab', { name: tab })).toBeSelected();
    expect(screen.getByTestId(testID)).toBeOnTheScreen();
  });

  it('pressing the Questions tab renders its screen at /questions', async () => {
    const { router, requests } = await renderWithInbox(0);

    fireEvent.press(screen.getByRole('tab', { name: 'Questions' }));

    expect(router.getPathname()).toBe('/questions');
    expect(screen.getByRole('tab', { name: 'Questions' })).toBeSelected();
    expect(screen.getByTestId('questions-screen')).toBeOnTheScreen();
    await waitFor(() => {
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    });
  });

  it("the Summary's View skill tree action switches to the Tree tab", () => {
    const router = renderTabs('/');

    act(() => {
      openSkillTree();
    });

    expect(router.getPathname()).toBe('/tree');
    expect(screen.getByRole('tab', { name: 'Tree' })).toBeSelected();
    expect(screen.getByTestId('tree-screen')).toHaveTextContent(/^Skill tree/);
  });

  it("with no active topic, the Today screen's Explore button switches to the Explore tab", async () => {
    getNextSet.mockRejectedValueOnce(new FeedLoadError('No active topic', { kind: 'noTopic' }));
    const router = renderTabs('/');

    fireEvent.press(await screen.findByRole('button', { name: 'Explore topics' }));

    expect(router.getPathname()).toBe('/explore');
    expect(screen.getByRole('tab', { name: 'Explore' })).toBeSelected();
  });

  it('pressing the Today tab from another tab renders /', () => {
    const router = renderTabs('/profile');

    fireEvent.press(screen.getByRole('tab', { name: 'Today' }));

    expect(router.getPathname()).toBe('/');
    expect(screen.getByTestId('today-screen')).toBeOnTheScreen();
  });
});

describe('the Questions tab badge', () => {
  it('draws the Questions tab with a MessageCircle in ink, filled pink when active', async () => {
    await renderWithInbox(0, '/questions');

    const box = screen.getByTestId('tab-icon-box-questions');
    expect(within(box).UNSAFE_getAllByType(MessageCircle)).toHaveLength(1);
    expect(viewStyleOf(box)).toMatchObject({ backgroundColor: colors.pink });
  });

  it('shows the count of new items on the Questions icon box, spoken as "3 new"', async () => {
    await renderWithInbox(3);

    const badge = within(screen.getByTestId('tab-icon-box-questions')).getByTestId(
      'tab-badge-questions',
    );
    expect(badge).toHaveTextContent('3');
    expect(badge).toHaveProp('accessibilityLabel', '3 new');
    // VoiceOver reads the tab's own label and value, never a label inside it.
    expect(screen.getByRole('tab', { name: 'Questions' })).toHaveProp('accessibilityValue', {
      text: '3 new',
    });
  });

  it('is a 16-point ink circle at the icon box top-right, its count in paper', async () => {
    await renderWithInbox(3);

    expect(viewStyleOf(screen.getByTestId('tab-badge-questions'))).toMatchObject({
      position: 'absolute',
      top: -8,
      right: -8,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.ink,
    });
    expect(textStyleOf(screen.getByText('3'))).toMatchObject({ color: colors.paper });
  });

  it('is hidden at 0', async () => {
    await renderWithInbox(0);

    expect(screen.getByRole('tab', { name: 'Questions' })).toBeOnTheScreen();
    expect(screen.queryByTestId('tab-badge-questions')).toBeNull();
    const { props } = screen.getByRole('tab', { name: 'Questions' });
    expect(
      (props as { accessibilityValue?: { text?: string } }).accessibilityValue?.text,
    ).toBeUndefined();
  });

  it('reads 99+ above 99', async () => {
    await renderWithInbox(120);

    const badge = screen.getByTestId('tab-badge-questions');
    expect(badge).toHaveTextContent('99+');
    expect(badge).toHaveProp('accessibilityLabel', '120 new');
  });
});

// The Tree, Explore and Profile screens draw through TabScreen, whose own test covers their
// ground, inset and title; each screen's test checks its root too. Some need a navigator.
describe('tab screens', () => {
  it('Today: paper ground, padded by the top safe-area inset', () => {
    renderWithTopInset(TodayScreen);

    expect(viewStyleOf(screen.getByTestId('today-screen'))).toMatchObject({
      flex: 1,
      paddingTop: TOP_INSET,
      backgroundColor: colors.paper,
    });
  });
});
