import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Card, SourceLink } from '../data';

const NO_SOURCES: readonly SourceLink[] = [];

/**
 * The card a frame here holds, for its id and sources; null outside any `SourcesTarget`. The feed
 * screen puts a `SourcesTarget` around each card it draws, as it does `FlagTarget`; the frame
 * (src/components/CardFrame.tsx), its book icon (src/cards/SourcesButton.tsx) and the source
 * sheet (src/cards/SourceSheet.tsx) read it. Kept apart from those modules so that neither the
 * button nor the sheet has to import the other for it.
 */
const SourcesContext = createContext<Card | null>(null);

/** Gives a frame inside it the card it holds, for its id and sources. */
export function SourcesTarget({ card, children }: { card: Card; children: ReactNode }) {
  return <SourcesContext.Provider value={card}>{children}</SourcesContext.Provider>;
}

/** The card a frame here holds; null outside any `SourcesTarget` (the Summary). */
export function useFrameCard(): Card | null {
  return useContext(SourcesContext);
}

/** The sources of the card a frame here holds, in the order the API sent them; none for none. */
export function useCardSources(): readonly SourceLink[] {
  return useContext(SourcesContext)?.sources ?? NO_SOURCES;
}

/** Whether a frame here shows the Sources action: its card has at least one source. */
export function useHasSources(): boolean {
  return useCardSources().length > 0;
}
