/**
 * The Sources action in a card frame's corner (M6 hardening Task 12): a small book icon, "Show me
 * the source" (M9 plan H Task 5), that opens the source sheet (src/cards/SourceSheet.tsx): the
 * passages the card was built from, then the card's sources.
 *
 * Which card a frame holds, and so its id and sources, comes from `SourcesTarget`
 * (src/cards/cardSources.tsx), which the feed screen puts around each card it draws, as it does
 * `FlagTarget`. A card from the API carries its node's sources (none for a checkpoint); the demo
 * cards have none, and a frame with no target (the Summary) shows no action either.
 */
import { BookOpen } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import { useFrameCard } from './cardSources';
import { SourceSheet } from './SourceSheet';

/** The icon's size: small, beside the kicker's 10-point text, as the flag's. */
const ICON_SIZE = 14;
/** Grows the touch target to at least 44 points around the small icon. */
const HIT_SLOP = 15;

/** The Sources icon button and its sheet; the frame shows it only when `useHasSources()`. */
export function SourcesButton() {
  const cardId = useFrameCard()?.id ?? null;
  const color = useCardTextColor();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.source.action}
        hitSlop={HIT_SLOP}
        onPress={() => {
          setOpen(true);
        }}
        style={styles.button}
      >
        <BookOpen size={ICON_SIZE} color={color} />
      </Pressable>
      {open ? (
        <SourceSheet
          cardId={cardId}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});
