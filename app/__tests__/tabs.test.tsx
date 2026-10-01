import { render } from '@testing-library/react-native';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryWrapper } from '../../src/api/testing/fakeApi';
import { openSkillTree } from '../../src/components/FeedScreen';
import { textStyleOf, viewStyleOf } from '../../src/components/testing/styles';
import { cardSource, FeedLoadError } from '../../src/data';
import { useFeedStore } from '../../src/feed/store';
import { cardsByType, makeSet } from '../../src/feed/testing/sets';
import { colors, type } from '../../src/theme';
import TabsLayout from '../(tabs)/_layout';
import ExploreScreen from '../(tabs)/explore';
import TodayScreen from '../(tabs)/index';
import ProfileScreen from '../(tabs)/profile';
import TreeScreen from '../(tabs)/tree';

// The package's own Jest mock: its SafeAreaProvider serves `initialMetrics` from context, with
// no native module.
jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});

// The shell tests do not need cards. The shared source's answer never arrives, so the Today tab
// stays in its loading state and nothing updates after a test ends; the test that looks at the
// loaded Today screen gives it a set.
let getNextSet: jest.SpiedFunction<typeof cardSource.getNextSet>;

beforeEach(() => {
  useFeedStore.setState(useFeedStore.getInitialState(), true);
  getNextSet = jest.spyOn(cardSource, 'getNextSet').mockReturnValue(new Promise(() => undefined));
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
  '(tabs)/profile': ProfileScreen,
};

const PLACEHOLDERS = [
  { path: '/profile', tab: 'Profile', title: 'Profile', Screen: ProfileScreen },
];

/** The built tab screens, each with its root's test id and its title. */
const SCREENS = [
  { path: '/tree', tab: 'Tree', title: 'Skill tree', Screen: TreeScreen, testID: 'tree-screen' },
  {
    path: '/explore',
    tab: 'Explore',
    title: 'Explore',
    Screen: ExploreScreen,
    testID: 'explore-screen',
  },
];

/** Renders the tab routes at `initialUrl`, with a fresh server-state cache. */
function renderTabs(initialUrl: string) {
  return renderRouter(ROUTES, { initialUrl, wrapper: queryWrapper().wrapper });
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

  it('orders the tabs Today, Tree, Explore, Profile, with Today selected at /', () => {
    renderTabs('/');

    const tabs = screen.getAllByRole('tab');
    ['Today', 'Tree', 'Explore', 'Profile'].forEach((name, position) => {
      expect(tabs[position]).toBe(screen.getByRole('tab', { name }));
    });
    expect(tabs).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Today' })).toBeSelected();
  });

  it.each(PLACEHOLDERS)('pressing the $tab tab renders $path', ({ path, tab, title }) => {
    const router = renderTabs('/');

    fireEvent.press(screen.getByRole('tab', { name: tab }));

    expect(router.getPathname()).toBe(path);
    expect(screen.getByRole('tab', { name: tab })).toBeSelected();
    expect(screen.getByTestId('placeholder-screen')).toHaveTextContent(title);
  });

  it.each(SCREENS)('pressing the $tab tab renders its screen at $path', ({ path, tab, testID }) => {
    const router = renderTabs('/');

    fireEvent.press(screen.getByRole('tab', { name: tab }));

    expect(router.getPathname()).toBe(path);
    expect(screen.getByRole('tab', { name: tab })).toBeSelected();
    expect(screen.getByTestId(testID)).toBeOnTheScreen();
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

  it.each(PLACEHOLDERS)('$path shows only its title, $title', ({ path, title }) => {
    renderTabs(path);

    const placeholder = screen.getByTestId('placeholder-screen');
    expect(placeholder).toHaveTextContent(title, { exact: true });
  });
});

// The built tab screens draw through TabScreen, whose own test covers their ground, inset and
// title; each screen's test checks its root too. Some need a navigator, so they are not here.
describe('tab screens', () => {
  it.each([
    { name: 'Today', Screen: TodayScreen, testID: 'today-screen' },
    ...PLACEHOLDERS.map(({ tab, Screen }) => ({ name: tab, Screen, testID: 'placeholder-screen' })),
  ])('$name: paper ground, padded by the top safe-area inset', ({ Screen, testID }) => {
    renderWithTopInset(Screen);

    expect(viewStyleOf(screen.getByTestId(testID))).toMatchObject({
      flex: 1,
      paddingTop: TOP_INSET,
      backgroundColor: colors.paper,
    });
  });

  it.each(PLACEHOLDERS)('$tab: the title in the tab title style, in ink', ({ title, Screen }) => {
    renderWithTopInset(Screen);

    expect(textStyleOf(screen.getByText(title))).toMatchObject({
      ...type.tabTitle,
      color: colors.ink,
    });
  });
});
