import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { GitBranch, Layers, Search, User } from 'lucide-react-native';

import { border, colors } from '../../theme';
import { TabBar } from '../TabBar';
import type { TabBarProps } from '../TabBar';
import { textStyleOf, viewStyleOf } from '../testing/styles';
import type { Element } from '../testing/styles';

type Navigation = TabBarProps['navigation'];

const ROUTE_NAMES = ['index', 'tree', 'explore', 'profile'] as const;
const LABELS = ['Today', 'Tree', 'Explore', 'Profile'];
const HIDDEN = { includeHiddenElements: true };

// Each tab's active fill, README.md:34.
const ACTIVE = [
  { index: 0, name: 'index', label: 'Today', fill: colors.violet },
  { index: 1, name: 'tree', label: 'Tree', fill: colors.aqua },
  { index: 2, name: 'explore', label: 'Explore', fill: colors.coral },
  { index: 3, name: 'profile', label: 'Profile', fill: colors.yellow },
] as const;

/** A tab navigator's state with one route per name, focused on `index`. */
function tabState(index: number, names: readonly string[] = ROUTE_NAMES): TabBarProps['state'] {
  return { index, routes: names.map((name) => ({ key: `${name}-key`, name })) };
}

/** Jest functions for the two navigation calls the bar makes. `emit` reports `prevented`. */
function fakeNavigation(prevented = false) {
  const emit = jest.fn<ReturnType<Navigation['emit']>, Parameters<Navigation['emit']>>(() => ({
    defaultPrevented: prevented,
  }));
  const navigate = jest.fn<
    ReturnType<Navigation['navigate']>,
    Parameters<Navigation['navigate']>
  >();
  return { emit, navigate };
}

type BarOptions = {
  index?: number;
  bottom?: number;
  prevented?: boolean;
  names?: readonly string[];
};

function renderBar({
  index = 0,
  bottom = 34,
  prevented = false,
  names = ROUTE_NAMES,
}: BarOptions = {}) {
  const navigation = fakeNavigation(prevented);
  const insets = { top: 47, right: 0, bottom, left: 0 };
  render(<TabBar state={tabState(index, names)} navigation={navigation} insets={insets} />);
  return navigation;
}

const tabs = () => screen.getAllByRole('tab');
/** A tab's spoken label. RNTL 13 types `props` as `any`; name the one field read here. */
const spokenLabel = (tab: Element) =>
  (tab.props as { accessibilityLabel?: unknown }).accessibilityLabel;
const spokenLabels = () => tabs().map(spokenLabel);
const iconBox = (name: string) => screen.getByTestId(`tab-icon-box-${name}`);

describe('TabBar tabs', () => {
  it('shows Today, Tree, Explore and Profile in that order, each with its label', () => {
    renderBar();

    expect(spokenLabels()).toStrictEqual(LABELS);
    tabs().forEach((tab, position) => {
      expect(within(tab).getByText(LABELS[position] ?? '')).toBeOnTheScreen();
    });
  });

  it.each([
    { name: 'index', Icon: Layers },
    { name: 'tree', Icon: GitBranch },
    { name: 'explore', Icon: Search },
    { name: 'profile', Icon: User },
  ])(
    'draws its Lucide icon at 20 points, stroke 1.5, in ink on the $name tab',
    ({ name, Icon }) => {
      renderBar();

      // The icon component itself, found by type inside this tab's icon box.
      expect(within(iconBox(name)).UNSAFE_getAllByType(Icon)).toHaveLength(1);
      const svg = within(iconBox(name)).getByTestId(`tab-icon-${name}`, HIDDEN);
      expect(svg.props).toMatchObject({
        width: 20,
        height: 20,
        stroke: colors.ink,
        strokeWidth: 1.5,
      });
    },
  );

  it('labels each tab at 11 points in ink', () => {
    renderBar();

    for (const label of LABELS) {
      expect(textStyleOf(screen.getByText(label))).toMatchObject({
        fontSize: 11,
        color: colors.ink,
      });
    }
  });

  it('renders nothing for an unknown route name, without throwing', () => {
    renderBar({ names: ['index', 'settings', 'toString', 'profile'] });

    expect(spokenLabels()).toStrictEqual(['Today', 'Profile']);
  });
});

describe('TabBar active and inactive tabs', () => {
  it.each(ACTIVE)(
    '$label active: a 40 by 28 box filled $fill with a 1.5 ink border',
    ({ index, name, fill }) => {
      renderBar({ index });

      expect(viewStyleOf(iconBox(name))).toMatchObject({
        width: 40,
        height: 28,
        backgroundColor: fill,
        borderWidth: border.strong,
        borderColor: colors.ink,
      });
    },
  );

  it.each(ACTIVE)(
    '$label active: every other box has no fill and a transparent 1.5 border',
    ({ index, name }) => {
      renderBar({ index });

      for (const other of ROUTE_NAMES.filter((routeName) => routeName !== name)) {
        expect(viewStyleOf(iconBox(other))).toMatchObject({
          width: 40,
          height: 28,
          backgroundColor: 'transparent',
          borderWidth: border.strong,
          borderColor: 'transparent',
        });
      }
    },
  );
});

describe('TabBar presses', () => {
  it('pressing an inactive tab emits tabPress and navigates to its route', () => {
    const navigation = renderBar({ index: 0 });

    fireEvent.press(screen.getByRole('tab', { name: 'Explore' }));

    expect(navigation.emit).toHaveBeenCalledTimes(1);
    expect(navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'explore-key',
      canPreventDefault: true,
    });
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('explore', undefined);
  });

  it('pressing the active tab emits tabPress and does not navigate', () => {
    const navigation = renderBar({ index: 1 });

    fireEvent.press(screen.getByRole('tab', { name: 'Tree' }));

    expect(navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'tree-key',
      canPreventDefault: true,
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when a listener prevents the tabPress event', () => {
    const navigation = renderBar({ index: 0, prevented: true });

    fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));

    expect(navigation.emit).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('TabBar accessibility', () => {
  it.each(ACTIVE)('$label active: only that tab is selected', ({ index }) => {
    renderBar({ index });

    tabs().forEach((tab, position) => {
      expect(tab.props).toMatchObject({
        accessibilityRole: 'tab',
        accessibilityLabel: LABELS[position],
        accessibilityState: { selected: position === index },
      });
    });
  });

  it('gives every tab a touch target at least 44 points tall', () => {
    renderBar({ bottom: 0 });

    for (const tab of tabs()) {
      expect(viewStyleOf(tab)).toMatchObject({ flex: 1, minHeight: 44 });
    }
  });

  it('hides every icon from accessibility', () => {
    renderBar();

    for (const name of ROUTE_NAMES) {
      expect(screen.queryByTestId(`tab-icon-${name}`)).toBeNull();
      expect(screen.getByTestId(`tab-icon-${name}`, HIDDEN).props).toMatchObject({
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      });
    }
  });

  it('groups the tabs in a tab list', () => {
    renderBar();

    expect(screen.getByTestId('tab-bar').props).toMatchObject({ accessibilityRole: 'tablist' });
  });
});

describe('TabBar frame', () => {
  // Border-box, as the prototype draws it (line 345, `height:82px`, `padding:8px 8px 22px`, with
  // `box-sizing: border-box` from its design system): 1.5 border + 8 top padding + a 50.5 tab
  // area + the bottom padding, which is the inset less 12, at least 8.
  it.each([
    { bottom: 34, paddingBottom: 22, height: 82 },
    { bottom: 0, paddingBottom: 8, height: 68 },
    { bottom: 20, paddingBottom: 8, height: 68 },
    { bottom: 48, paddingBottom: 36, height: 96 },
  ])(
    'is $height tall with a bottom inset of $bottom: bottom padding $paddingBottom',
    ({ bottom, paddingBottom, height }) => {
      renderBar({ bottom });

      expect(viewStyleOf(screen.getByTestId('tab-bar'))).toMatchObject({
        height,
        paddingTop: 8,
        paddingBottom,
      });
    },
  );

  it('puts each tab in a 50.5 tall area, its content at the top', () => {
    renderBar();

    for (const tab of tabs()) {
      expect(viewStyleOf(tab)).toMatchObject({
        height: 50.5,
        alignItems: 'center',
        justifyContent: 'flex-start',
      });
    }
  });

  it('has a 1.5 ink top border on a paper ground, and four equal columns', () => {
    renderBar();

    expect(viewStyleOf(screen.getByTestId('tab-bar'))).toMatchObject({
      flexDirection: 'row',
      borderTopWidth: border.strong,
      borderTopColor: colors.ink,
      backgroundColor: colors.paper,
      paddingHorizontal: 8,
    });
    for (const tab of tabs()) {
      expect(viewStyleOf(tab).flex).toBe(1);
    }
  });
});
