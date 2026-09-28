import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { GitBranch, Layers, Search, User } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { border, colors, fonts } from '../theme';

// Tab bar values from docs/design/card-feed/README.md:32-35 (or, where it gives none, the
// prototype docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html) that the theme lacks.
/**
 * Height above the bottom safe-area inset. README.md:32 gives 82 including the home-indicator
 * area on the 390x844 reference device, whose bottom inset is 34: 82 - 34 = 48, top border
 * included. With no inset the bar is 48 tall. The prototype pads 8 above and 22 below (line 345),
 * which leaves no room for a 34 inset, so the tabs are centered in the 48 instead.
 */
const BAR_HEIGHT_ABOVE_INSET = 48;
/** Side padding of the bar, from the prototype (`padding:8px 8px 22px`, line 345). */
const BAR_PADDING_X = 8;
/** The icon box, README.md:33. */
const ICON_BOX_WIDTH = 40;
const ICON_BOX_HEIGHT = 28;
/** Icon size. README.md:22 allows 16-22; the prototype's tab icons are 20 (lines 347-353). */
const ICON_SIZE = 20;
/** Icon stroke width, README.md:22. */
const ICON_STROKE = 1.5;
/** Gap between the icon box and the label, from the prototype (`gap:3px`, line 346). */
const LABEL_GAP = 3;
/** Label size, README.md:33. The theme has no 11-point style (its caption is 12). */
const LABEL_SIZE = 11;
/** Minimum touch target, from the plan's accessibility rule. */
const MIN_TOUCH = 44;

type Tab = { label: string; Icon: LucideIcon; color: string };

/** Each tab route's label, icon and active fill, README.md:32 and 34. Keyed by Expo Router name. */
const TABS: ReadonlyMap<string, Tab> = new Map([
  ['index', { label: copy.tabs.today, Icon: Layers, color: colors.violet }],
  ['tree', { label: copy.tabs.tree, Icon: GitBranch, color: colors.aqua }],
  ['explore', { label: copy.tabs.explore, Icon: Search, color: colors.coral }],
  ['profile', { label: copy.tabs.profile, Icon: User, color: colors.yellow }],
]);

/**
 * The part of Expo Router's `BottomTabBarProps` the bar reads. The navigator's props fit it as
 * they are (the type checker proves it in `app/(tabs)/_layout.tsx`), and a test can build it by
 * hand. `navigation` names only the two calls the bar makes, as it makes them.
 */
export type TabBarProps = Pick<BottomTabBarProps, 'insets'> & {
  state: Pick<BottomTabBarProps['state'], 'index' | 'routes'>;
  navigation: {
    /** React Navigation's `emit`, as the bar calls it: a tab press that a listener may prevent. */
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string, params?: object) => void;
  };
};

type Route = TabBarProps['state']['routes'][number];

/**
 * The custom tab bar for Expo Router's `Tabs` (README.md:32-35): four equal columns, each an icon
 * box above a label. The focused tab's box is filled with its color and framed in ink. The bar is
 * 48 points plus the bottom safe-area inset, with a 1.5-point ink top border on paper.
 */
export function TabBar({ state, navigation, insets }: TabBarProps) {
  /** React Navigation's custom tab bar press: emit, then navigate unless focused or prevented. */
  const press = (route: Route, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(route.name, route.params);
    }
  };

  return (
    <View
      testID="tab-bar"
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { height: BAR_HEIGHT_ABOVE_INSET + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {state.routes.map((route, position) => {
        const tab = TABS.get(route.name);
        if (tab === undefined) return null;
        const focused = position === state.index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
            onPress={() => {
              press(route, focused);
            }}
            style={styles.tab}
          >
            <View
              testID={`tab-icon-box-${route.name}`}
              style={[styles.iconBox, focused ? { backgroundColor: tab.color } : styles.idleBox]}
            >
              <tab.Icon
                testID={`tab-icon-${route.name}`}
                size={ICON_SIZE}
                strokeWidth={ICON_STROKE}
                color={colors.ink}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <Text style={styles.label}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: BAR_PADDING_X,
    borderTopWidth: border.strong,
    borderTopColor: colors.ink,
    backgroundColor: colors.paper,
  },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: LABEL_GAP,
  },
  iconBox: {
    width: ICON_BOX_WIDTH,
    height: ICON_BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  // A transparent border of the same width keeps the layout from shifting when a tab is focused.
  idleBox: { backgroundColor: 'transparent', borderColor: 'transparent' },
  label: { fontFamily: fonts.body, fontSize: LABEL_SIZE, color: colors.ink },
});
