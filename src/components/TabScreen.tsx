import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space, type } from '../theme';

// Tab screen values from the prototype (docs/design/card-feed/reference/LearnLoop Card Feed
// v2.dc.html) that the theme lacks: the tab screens use `padding:6px 22px 20px 18px`.
const PADDING_TOP = 6;
const PADDING_RIGHT = 22;
const PADDING_LEFT = 18;

type TabScreenProps = {
  testID: string;
  /** The screen's title, from `copy`, in the tab title style. */
  title: string;
  /** Above the title, in the kicker style, when given ("SKILL TREE"). */
  kicker?: string;
  children?: ReactNode;
};

/**
 * The Tree, Explore and Profile tabs' frame: on paper, below the top safe-area inset, an optional
 * kicker, the title as a header, then the screen's content, which fills the rest.
 */
export function TabScreen({ testID, title, kicker, children }: TabScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View testID={testID} style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {kicker === undefined ? null : <Text style={styles.kicker}>{kicker}</Text>}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    flex: 1,
    paddingTop: PADDING_TOP,
    paddingRight: PADDING_RIGHT,
    paddingLeft: PADDING_LEFT,
    gap: space[4],
  },
  kicker: { ...type.kicker, color: colors.neutral[700] },
  title: { ...type.tabTitle, color: colors.ink },
});
