import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '../theme';
import { announce } from './announce';
import { PrimaryButton } from './PrimaryButton';

/**
 * Side padding of the message and button. The design has no error screen; this is the feed
 * header's side padding, docs/design/card-feed/README.md:27 ("6/18/12"). The header keeps its
 * value private, so it is repeated here rather than exported from there.
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
 * A screen's whole content when it has one thing to say: the message, centered on the paper
 * ground, with an optional button under it. It fills its parent and takes no safe-area padding;
 * the screen that hosts it pads. Screen readers hear the message when it appears, and again
 * when it changes.
 */
export function ErrorScreen({ message, actionLabel, onAction }: ErrorScreenProps) {
  useEffect(() => {
    announce(message);
  }, [message]);

  return (
    <View testID="error-screen" style={styles.root}>
      <View style={styles.content}>
        <View testID="error-message" accessibilityLiveRegion="polite">
          <Text style={styles.message}>{message}</Text>
        </View>
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
