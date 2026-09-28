/**
 * Every mounted Strudel player, as the function that stops it if it is playing. Starting one
 * player stops all the others, so two cards in the pager never play at once. Each player still
 * has its own WebView and page.
 */
const players = new Set<() => void>();

/** Adds a player; the returned function removes it. */
export function registerPlayer(stopIfPlaying: () => void): () => void {
  players.add(stopIfPlaying);
  return () => {
    players.delete(stopIfPlaying);
  };
}

/** Stops every registered player except `current`, the one about to start. */
export function stopOtherPlayers(current: () => void): void {
  for (const stopIfPlaying of players) {
    if (stopIfPlaying !== current) {
      stopIfPlaying();
    }
  }
}
