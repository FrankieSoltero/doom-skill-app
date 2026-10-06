/**
 * UI strings of a card's Sources action and its sheet (M6 hardening Task 12). Part of `copy`
 * (src/copy/index.ts), which freezes them; read them through `copy`, not from here.
 */

/** The Sources action in a card frame's corner (src/cards/SourcesButton.tsx) and its sheet. */
export const sources = {
  /** A source's licence line; a source with no licence recorded reads as unknown. */
  licence: (license: string | null) => `Licence: ${license ?? 'unknown'}`,
  /** Closes the sheet. */
  close: 'Close',
};
