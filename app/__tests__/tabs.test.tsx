import { render } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import type { ComponentType } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { textStyleOf, viewStyleOf } from '../../src/components/testing/styles';
import { cardSource } from '../../src/data';
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
  { path: '/tree', tab: 'Tree', title: 'Skill tree', Screen: TreeScreen },
  { path: '/explore', tab: 'Explore', title: 'Explore', Screen: ExploreScreen },
  { path: '/profile', tab: 'Profile', title: 'Profile', Screen: ProfileScreen },
];

const TOP_INSET = 47;

/** Renders `Screen` alone, under a safe area whose top inset is 47 (the reference device's). */
function renderWithTopInset(Screen: ComponentType) {
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: TOP_INSET, right: 0, bottom: 34, left: 0 },
  };
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Screen />
    </SafeAreaProvider>,
  );
}

describe('tab routes', () => {
  it('renders the Today screen at /', async () => {
    getNextSet.mockResolvedValueOnce(makeSet(12, [cardsByType.concept]));
    const router = renderRouter(ROUTES, { initialUrl: '/' });

    expect(router.getPathname()).toBe('/');
    const header = await screen.findByTestId('feed-header');
    const today = screen.getByTestId('today-screen');
    expect(within(today).getByText('Today')).toBeOnTheScreen();
    expect(within(today).getByTestId('feed-header')).toBe(header);
  });

  it('draws the tab bar with no navigation header above the screen', () => {
    renderRouter(ROUTES, { initialUrl: '/' });

    expect(screen.getByTestId('tab-bar')).toBeOnTheScreen();
    // React Navigation's header draws the screen title as a heading; the Today screen has none.
    expect(screen.queryAllByRole('heading', { includeHiddenElements: true })).toHaveLength(0);
  });

  it('orders the tabs Today, Tree, Explore, Profile, with Today selected at /', () => {
    renderRouter(ROUTES, { initialUrl: '/' });

    const tabs = screen.getAllByRole('tab');
    ['Today', 'Tree', 'Explore', 'Profile'].forEach((name, position) => {
      expect(tabs[position]).toBe(screen.getByRole('tab', { name }));
    });
    expect(tabs).toHaveLength(4);
    expect(screen.getByRole('tab', { name: 'Today' })).toBeSelected();
  });

  it.each(PLACEHOLDERS)('pressing the $tab tab renders $path', ({ path, tab, title }) => {
    const router = renderRouter(ROUTES, { initialUrl: '/' });

    fireEvent.press(screen.getByRole('tab', { name: tab }));

    expect(router.getPathname()).toBe(path);
    expect(screen.getByRole('tab', { name: tab })).toBeSelected();
    expect(screen.getByTestId('placeholder-screen')).toHaveTextContent(title);
  });

  it('pressing the Today tab from another tab renders /', () => {
    const router = renderRouter(ROUTES, { initialUrl: '/profile' });

    fireEvent.press(screen.getByRole('tab', { name: 'Today' }));

    expect(router.getPathname()).toBe('/');
    expect(screen.getByTestId('today-screen')).toBeOnTheScreen();
  });

  it.each(PLACEHOLDERS)('$path shows only its title, $title', ({ path, title }) => {
    renderRouter(ROUTES, { initialUrl: path });

    const placeholder = screen.getByTestId('placeholder-screen');
    expect(placeholder).toHaveTextContent(title, { exact: true });
  });
});

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
