import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, type } from '../theme';

// Placeholder screen values from the prototype
// (docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html) that the theme lacks.
/** Padding around the title: the prototype's tab screens use `padding:6px 22px 20px 18px`. */
const PADDING_TOP = 6;
const PADDING_RIGHT = 22;
const PADDING_LEFT = 18;

type PlaceholderScreenProps = {
  /** The tab's title, from `copy.placeholder`. */
  title: string;
};

/**
 * A tab that shows only its title (spec section 10), in the tab title style on paper, below the
 * top safe-area inset.
 */
export function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View testID="placeholder-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { paddingTop: PADDING_TOP, paddingRight: PADDING_RIGHT, paddingLeft: PADDING_LEFT },
  title: { ...type.tabTitle, color: colors.ink },
});
