import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { border, colors, space, type } from '../theme';
import { CardTextColorProvider } from './cardTextColor';

type BottomSheetProps = {
  /** The sheet's heading. */
  title: string;
  /** The text of the button at the bottom that closes the sheet. */
  cancelLabel: string;
  /** Called on that button, a tap above the sheet, or the Android back button. */
  onClose: () => void;
  /** The sheet panel's test id. */
  testID: string;
  /** Shown while true (the default). */
  visible?: boolean;
  /** What goes between the heading and the close button. */
  children: ReactNode;
};

/**
 * A bottom sheet: a paper panel over the bottom of the screen, under a dimmed backdrop, with its
 * heading, the caller's content and a close button. Its text is ink whatever is under it, so a
 * card frame's text color (the exercise card's paper) does not reach it. Used by the flag action
 * (src/cards/FlagSheet.tsx) and Delete account (src/profile/DeleteAccountSheet.tsx).
 */
export function BottomSheet({
  title,
  cancelLabel,
  onClose,
  testID,
  visible = true,
  children,
}: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <CardTextColorProvider color={colors.ink}>
        <View style={styles.backdrop}>
          <Pressable style={styles.above} onPress={onClose} accessible={false} />
          <View testID={testID} style={styles.sheet}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {children}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onClose}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </CardTextColorProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.divider },
  above: { flex: 1 },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: border.strong,
    borderColor: colors.ink,
    paddingHorizontal: space[6],
    paddingTop: space[6],
    // Clears the home indicator on phones without a home button.
    paddingBottom: space[8],
    gap: space[3],
  },
  title: { ...type.cardTitleS, color: colors.ink },
  // At least 44 points tall: the minimum touch target.
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...type.button, color: colors.ink },
});
