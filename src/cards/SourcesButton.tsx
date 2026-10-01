/**
 * The Sources action in a card frame's corner (M6 hardening Task 12): a small book icon that
 * opens the sheet of the card's sources (src/components/SourcesSheet.tsx).
 *
 * Which sources a frame's card has comes from `SourcesTarget`, which the feed screen puts around
 * each card it draws, as it does `FlagTarget`. A card from the API carries its node's sources
 * (none for a checkpoint); the demo cards have none, and a frame with no target (the Summary)
 * shows no action either.
 */
import { BookOpen } from 'lucide-react-native';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useCardTextColor } from '../components/cardTextColor';
import { SourcesSheet } from '../components/SourcesSheet';
import { copy } from '../copy';
import type { Card, SourceLink } from '../data';

/** The icon's size: small, beside the kicker's 10-point text, as the flag's. */
const ICON_SIZE = 14;
/** Grows the touch target to at least 44 points around the small icon. */
const HIT_SLOP = 15;
const NO_SOURCES: readonly SourceLink[] = [];

const SourcesContext = createContext<readonly SourceLink[]>(NO_SOURCES);

/** Gives a frame inside it the sources of the card it holds (module comment). */
export function SourcesTarget({ card, children }: { card: Card; children: ReactNode }) {
  return (
    <SourcesContext.Provider value={card.sources ?? NO_SOURCES}>{children}</SourcesContext.Provider>
  );
}

/** Whether a frame here shows the Sources action: its card has at least one source. */
export function useHasSources(): boolean {
  return useContext(SourcesContext).length > 0;
}

/** The Sources icon button and its sheet; the frame shows it only when `useHasSources()`. */
export function SourcesButton() {
  const sources = useContext(SourcesContext);
  const color = useCardTextColor();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.sources.action}
        hitSlop={HIT_SLOP}
        onPress={() => {
          setOpen(true);
        }}
        style={styles.button}
      >
        <BookOpen size={ICON_SIZE} color={color} />
      </Pressable>
      <SourcesSheet
        visible={open}
        sources={sources}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center' },
});
