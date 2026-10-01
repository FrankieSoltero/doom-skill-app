import { StyleSheet, Text, View } from 'react-native';

import { colors, type } from '../theme';

type LoadingStateProps = {
  /** The line shown and spoken, from `copy` ("Loading…"). */
  label: string;
};

/**
 * A screen's or a section's content while its data loads: one neutral line, centered in the space
 * it is given. A screen reader lands on it and hears it as a busy progress bar, as the Today
 * screen's loading line (src/components/FeedScreen.tsx).
 */
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <View
      testID="loading-state"
      style={styles.root}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { ...type.body, color: colors.neutral[700] },
});
