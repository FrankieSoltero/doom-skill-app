/**
 * The Sources action in a card frame's corner (M6 hardening Task 12): a small book icon, "Show me
 * the source" (M9 plan H Task 5), that opens the source sheet (src/cards/SourceSheet.tsx): the
 * passages the card was built from, then the card's sources.
 *
 * Which card a frame holds, and so its id and sources, comes from `SourcesTarget`, which the feed
 * screen puts around each card it draws, as it does `FlagTarget`. A card from the API carries its
 * node's sources (none for a checkpoint); the demo cards have none, and a frame with no target
 * (the Summary) shows no action either.
 */
import { BookOpen } from 'lucide-react-native';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import type { Card, SourceLink } from '../data';
import { SourceSheet } from './SourceSheet';

/** The icon's size: small, beside the kicker's 10-point text, as the flag's. */
const ICON_SIZE = 14;
/** Grows the touch target to at least 44 points around the small icon. */
const HIT_SLOP = 15;
const NO_SOURCES: readonly SourceLink[] = [];

/** The card a frame here holds; null outside any `SourcesTarget`. */
const SourcesContext = createContext<Card | null>(null);

/** Gives a frame inside it the card it holds, for its id and sources (module comment). */
export function SourcesTarget({ card, children }: { card: Card; children: ReactNode }) {
  return <SourcesContext.Provider value={card}>{children}</SourcesContext.Provider>;
}

/** The sources of the card a frame here holds, in the order the API sent them; none for none. */
export function useCardSources(): readonly SourceLink[] {
  return useContext(SourcesContext)?.sources ?? NO_SOURCES;
}

/** Whether a frame here shows the Sources action: its card has at least one source. */
export function useHasSources(): boolean {
  return useCardSources().length > 0;
}

/** The Sources icon button and its sheet; the frame shows it only when `useHasSources()`. */
export function SourcesButton() {
  const cardId = useContext(SourcesContext)?.id ?? null;
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
