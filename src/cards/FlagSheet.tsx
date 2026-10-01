import { BottomSheet } from '../components/BottomSheet';
import { OutlineButton } from '../components/OutlineButton';
import { copy } from '../copy';
import type { FlagReason } from '../data';

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
 * The bottom sheet of the flag action (src/cards/FlagButton.tsx): the title, one full-width button
 * per reason and Cancel, on the shared `BottomSheet`, whose text is ink whatever the card under it.
 */
export function FlagSheet({ visible, onChoose, onClose }: FlagSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      title={copy.flag.action}
      cancelLabel={copy.flag.cancel}
      onClose={onClose}
      testID="flag-sheet"
    >
      {REASONS.map((reason) => (
        <OutlineButton
          key={reason}
          label={copy.flag.reasons[reason]}
          onPress={() => {
            onChoose(reason);
          }}
        />
      ))}
    </BottomSheet>
  );
}
