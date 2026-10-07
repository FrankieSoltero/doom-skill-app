import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { GitBranch, Layers, MessageCircle, Search, User } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { useInputFocused } from '../feed/inputFocus';
import { useInbox } from '../qa/useInbox';
import { border, colors, fonts } from '../theme';

// Tab bar values from docs/design/card-feed/README.md:32-35 (or, where it gives none, the
// prototype docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html) that the theme lacks.
// The bar's height, README.md:32: 82 including the home-indicator area on the 390x844 reference
// device. The prototype splits it (line 345, `height:82px`, `padding:8px 8px 22px`, border-box
// from its design system's `box-sizing: border-box`): 1.5 top border + 8 + 50.5 + 22 = 82.
/** Padding above the tabs, prototype line 345. */
const BAR_PADDING_TOP = 8;
/** Height of the tabs: 82 - 1.5 border - 8 top padding - 22 bottom padding. */
const TAB_AREA_HEIGHT = 50.5;
/**
 * How far the tabs reach into the home-indicator area: the reference device's 34-point bottom
 * inset less the prototype's 22-point bottom padding.
 */
const HOME_INDICATOR_OVERLAP = 12;
/** The least bottom padding, so the bar stays balanced on a device with no home indicator. */
const MIN_BAR_PADDING_BOTTOM = 8;
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
// The badge (M10 plan Q decision Q11), which the design files do not draw: a 16-point circle
// centered on the icon box's top-right corner.
/** The badge's diameter. */
const BADGE_SIZE = 16;
/** The badge count's size: the largest that fits two digits in the circle. */
const BADGE_TEXT_SIZE = 10;
/** Side padding inside the badge, so `99+` widens it into a pill. */
const BADGE_PADDING_X = 3;
/** The largest count the badge shows; above it, it reads `99+`. */
const MAX_BADGE = 99;

type Tab = { label: string; Icon: LucideIcon; color: string };

/** Each tab route's label, icon and active fill, README.md:32 and 34. Keyed by Expo Router name. */
const TABS: ReadonlyMap<string, Tab> = new Map([
  ['index', { label: copy.tabs.today, Icon: Layers, color: colors.violet }],
  ['tree', { label: copy.tabs.tree, Icon: GitBranch, color: colors.aqua }],
  ['explore', { label: copy.tabs.explore, Icon: Search, color: colors.coral }],
  ['questions', { label: copy.qa.tab, Icon: MessageCircle, color: colors.pink }],
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
  /** Each tab's count of new items, by route name; a tab with none, or 0, shows no badge. */
  badges?: Readonly<Partial<Record<string, number>>>;
};

type Route = TabBarProps['state']['routes'][number];

/** The bar's full height, top border included (React Native sizes views border-box). */
function barHeight(paddingBottom: number): number {
  return border.strong + BAR_PADDING_TOP + TAB_AREA_HEIGHT + paddingBottom;
}

/** A tab's count of new items on its icon box's top-right corner, hidden at 0. */
function Badge({ name, count }: { name: string; count: number }) {
  if (count <= 0) return null;
  const text = count > MAX_BADGE ? copy.qa.badgeOver(MAX_BADGE) : String(count);
  return (
    <View
      testID={`tab-badge-${name}`}
      accessibilityLabel={copy.qa.badge(count)}
      style={styles.badge}
    >
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

/**
 * The custom tab bar for Expo Router's `Tabs` (README.md:32-35): equal columns, each an icon
 * box above a label. The focused tab's box is filled with its color and framed in ink. The bar has
 * a 1.5-point ink top border on paper; it is 82 points tall with a 34-point bottom inset and 68
 * with none.
 *
 * While a feed editor has focus the bar keeps its size and shows no tabs. With no on-screen
 * keyboard (a hardware keyboard), iOS floats the editor's Done bar over this bar, above the
 * home-indicator inset, and the labels would show under it.
 */
export function TabBar({ state, navigation, insets, badges = {} }: TabBarProps) {
  const paddingBottom = Math.max(insets.bottom - HOME_INDICATOR_OVERLAP, MIN_BAR_PADDING_BOTTOM);
  const editing = useInputFocused();
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
      style={[styles.bar, { height: barHeight(paddingBottom), paddingBottom }]}
    >
      {state.routes.map((route, position) => {
        const tab = TABS.get(route.name);
        if (tab === undefined || editing) return null;
        const focused = position === state.index;
        const count = badges[route.name] ?? 0;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            // The badge's own label sits inside this labelled tab, so VoiceOver reads the value.
            accessibilityValue={count > 0 ? { text: copy.qa.badge(count) } : undefined}
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
              <Badge name={route.name} count={count} />
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
    paddingTop: BAR_PADDING_TOP,
    paddingHorizontal: BAR_PADDING_X,
    borderTopWidth: border.strong,
    borderTopColor: colors.ink,
    backgroundColor: colors.paper,
  },
  // The tabs sit at the top of their area, as in the prototype.
  tab: {
    flex: 1,
    height: TAB_AREA_HEIGHT,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  badge: {
    position: 'absolute',
    top: -BADGE_SIZE / 2,
    right: -BADGE_SIZE / 2,
    minWidth: BADGE_SIZE,
    height: BADGE_SIZE,
    paddingHorizontal: BADGE_PADDING_X,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  badgeText: {
    fontFamily: fonts.body,
    fontSize: BADGE_TEXT_SIZE,
    lineHeight: BADGE_SIZE,
    color: colors.paper,
  },
});

/**
 * The app's tab bar: `TabBar` with the Questions tab's badge from the learner's inbox. It mounts
 * the inbox query once, so the inbox polls while the tabs are shown (plan Q decision Q12) and the
 * badge updates on every tab. A failed inbox read shows no badge; the Questions screen shows the
 * error.
 */
export function InboxTabBar(props: TabBarProps) {
  const { badge } = useInbox();
  return <TabBar {...props} badges={{ questions: badge }} />;
}
