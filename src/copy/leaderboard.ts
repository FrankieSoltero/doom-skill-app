/**
 * UI strings of a topic's leaderboard: the topic screen's link and the leaderboard screen
 * (app/topic/[slug]/leaderboard.tsx). Part of `copy` (src/copy/index.ts), which freezes them;
 * read them through `copy`, not from here.
 */

/** The leaderboard screen and the topic screen's link to it (M10 plan P, Task 8). */
export const leaderboard = {
  /** The screen's header. */
  title: 'Leaderboard',
  /** The topic screen's link to the screen. */
  link: 'Leaderboard',
  /** Shown when no opted-in learner has points on the topic. */
  empty: 'No points yet — answer cards to earn some.',
  /** The caller's line: their rank and points on the topic. */
  you: (rank: number, points: number) => `You: #${String(rank)} · ${String(points)} points`,
  /** The caller's line when they have no points on the topic. */
  youNone: 'Answer cards in this topic to get a rank.',
  /** Under the caller's line when they are not opted in. */
  optIn: 'Opt in on your profile to appear here.',
  /** A row's points. */
  points: (n: number) => `${String(n)} points`,
  /** A row's rank. */
  rank: (n: number) => `#${String(n)}`,
  /** Shown over Retry when the board failed to load. */
  loadFailed: "Couldn't load the leaderboard.",
} as const;
