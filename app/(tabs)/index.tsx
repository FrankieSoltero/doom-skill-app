import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import { colors } from '../../src/theme';

/** The Today tab, the `/` route. A later task replaces its body with the card feed. */
export default function TodayScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View testID="today-screen" style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.text}>{copy.today}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  text: { color: colors.ink },
});
