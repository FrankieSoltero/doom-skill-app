/**
 * The help action in a card frame's kicker row (M9 plan H Task 6, spec 5.1): a small life-buoy
 * icon, "Help with this card", beside the book icon, that opens the help sheet
 * (src/cards/HelpSheet.tsx). The frame draws it for a card with a server id that is not a
 * checkpoint or the Summary, and only once the API has served a set (H9): the demo cards and a
 * frame with no card have none.
 */
import { LifeBuoy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import { HelpSheet } from './HelpSheet';

/** The icon's size: the book icon's and the flag's, so the kicker row keeps its height. */
const ICON_SIZE = 14;
/** Grows the touch target to at least 44 points around the small icon. */
const HIT_SLOP = 15;

type HelpButtonProps = {
  /** The server id of the card the frame holds. */
  cardId: string;
  /** That card's index in the set: an added card goes in right after it. */
  index: number;
  /** Called once after a card was added, so the frame shows its line. */
  onAdded: () => void;
};

/** The help icon button and its sheet, mounted only while open (module comment). */
export function HelpButton({ cardId, index, onAdded }: HelpButtonProps) {
  const color = useCardTextColor();
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.help.action}
        hitSlop={HIT_SLOP}
        onPress={() => {
          setOpen(true);
        }}
        style={styles.button}
      >
        <LifeBuoy size={ICON_SIZE} color={color} />
      </Pressable>
      {open ? <HelpSheet cardId={cardId} index={index} onClose={close} onAdded={onAdded} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});
