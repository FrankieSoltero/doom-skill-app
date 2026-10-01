import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { CardTextColorProvider } from '../components/cardTextColor';
import { OutlineButton } from '../components/OutlineButton';
import { copy } from '../copy';
import type { FlagReason } from '../data';
import { border, colors, space, type } from '../theme';

/** The reasons, in the sheet's order (copy.flag.reasons). */
const REASONS: readonly FlagReason[] = ['wrong', 'unclear', 'broken', 'other'];

type FlagSheetProps = {
  /** Shown while true. */
  visible: boolean;
  /** Called with the reason the learner pressed. The caller closes the sheet. */
  onChoose: (reason: FlagReason) => void;
  /** Called on Cancel, a tap above the sheet, or the Android back button. */
  onClose: () => void;
};

/**
 * The bottom sheet of the flag action (src/cards/FlagButton.tsx): a paper panel over the bottom of
 * the screen with the title, one full-width button per reason and Cancel. Its text is ink whatever
 * the card under it, so the exercise card's paper text color does not reach it.
 */
export function FlagSheet({ visible, onChoose, onClose }: FlagSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <CardTextColorProvider color={colors.ink}>
        <View style={styles.backdrop}>
          <Pressable style={styles.above} onPress={onClose} accessible={false} />
          <View testID="flag-sheet" style={styles.sheet}>
            <Text accessibilityRole="header" style={styles.title}>
              {copy.flag.action}
            </Text>
            {REASONS.map((reason) => (
              <OutlineButton
                key={reason}
                label={copy.flag.reasons[reason]}
                onPress={() => {
                  onChoose(reason);
                }}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.flag.cancel}
              onPress={onClose}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>{copy.flag.cancel}</Text>
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
