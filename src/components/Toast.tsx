import { useEffect } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, type } from '../theme';

// Toast values from docs/design/card-feed/README.md:43 and, where it gives none, the prototype
// docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:270. The theme has none of them.
/** Distance from the bottom edge of the parent (the pager), README.md:43. */
const TOAST_BOTTOM = 44;
/** Inner padding, top and bottom, prototype line 270 ("padding:6px 12px"). */
const TOAST_PADDING_VERTICAL = 6;
/** Inner padding, left and right, prototype line 270 ("padding:6px 12px"). */
const TOAST_PADDING_HORIZONTAL = 12;

type ToastProps = {
  /** The text shown and announced. */
  message: string;
  /** Hidden renders nothing. The caller shows the toast and hides it again after its delay. */
  visible: boolean;
};

/**
 * A short notice over the bottom of its parent (README.md:43): 12-point paper text on an ink
 * fill, centered 44 points above the parent's bottom edge. It takes no touches.
 *
 * Screen readers hear it when it appears. Android reads it through the polite live region. iOS has
 * no live regions and VoiceOver does not read a view just because it appeared, so on iOS the
 * message is announced with `AccessibilityInfo.announceForAccessibility`. Android is left to the
 * live region alone, so TalkBack does not read the message twice.
 */
export function Toast({ message, visible }: ToastProps) {
  useEffect(() => {
    if (visible && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [visible, message]);

  if (!visible) return null;

  return (
    <View testID="toast-anchor" style={styles.anchor}>
      <View testID="toast" style={styles.toast} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    bottom: TOAST_BOTTOM,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  toast: {
    paddingVertical: TOAST_PADDING_VERTICAL,
    paddingHorizontal: TOAST_PADDING_HORIZONTAL,
    backgroundColor: colors.ink,
  },
  text: { ...type.caption, color: colors.paper },
});
