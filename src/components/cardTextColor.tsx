import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { colors } from '../theme';

/**
 * The text color of the card being drawn: `cardTheme[type].fg` inside a `CardFrame`, ink outside
 * any frame. React Native text does not inherit color from a view, so the frame supplies it here.
 */
const CardTextColor = createContext<string>(colors.ink);

/** Supplies `color` as the card text color to everything inside it. Used by `CardFrame`. */
export function CardTextColorProvider({ color, children }: { color: string; children: ReactNode }) {
  return <CardTextColor value={color}>{children}</CardTextColor>;
}

/** The text color of the nearest enclosing card frame, or ink outside any frame. */
export function useCardTextColor(): string {
  return useContext(CardTextColor);
}
