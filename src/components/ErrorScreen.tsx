import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space, type } from '../theme';
import { PrimaryButton } from './PrimaryButton';

/**
 * Side padding of the message and button, inside the safe area. The design has no error screen;
 * this is the feed header's side padding, docs/design/card-feed/README.md:27 ("6/18/12").
 */
const CONTENT_PADDING_X = 18;

type ErrorScreenProps = {
  /** What went wrong, or why there is nothing to show, from `copy`. */
  message: string;
  /** The button's label. The button shows only when both this and `onAction` are given. */
  actionLabel?: string;
  onAction?: () => void;
};

/**
 * A whole screen that says one thing: the message, centered on the paper ground, with an optional
 * button under it. Padded by every safe-area inset, so it can stand anywhere, the root included.
 */
export function ErrorScreen({ message, actionLabel, onAction }: ErrorScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top,
    paddingRight: insets.right,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
  };

  return (
    <View testID="error-screen" style={[styles.root, padding]}>
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>
        {actionLabel !== undefined && onAction !== undefined ? (
          <PrimaryButton label={actionLabel} onPress={onAction} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', backgroundColor: colors.paper },
  content: { paddingHorizontal: CONTENT_PADDING_X, gap: space[4] },
  message: { ...type.body, color: colors.ink, textAlign: 'center' },
});
