/**
 * UI strings of the topic screens: the Explore tab and the pending topic card. Part of `copy`
 * (src/copy/index.ts), which freezes them; read them through `copy`, not from here.
 */

/** The Explore tab (app/(tabs)/explore.tsx). */
export const explore = {
  title: 'Explore',
  /** The search field's placeholder, docs/design/card-feed/screenshots/09-explore.png. */
  searchPlaceholder: 'Learn anything technical…',
  /** Spoken label of the search field. */
  searchLabel: 'Search topics',
  /** Shown before anything is typed. */
  idle: 'Search for a topic to learn.',
  searching: 'Searching…',
  /** No topic matches the query; the Create button follows. */
  noMatch: 'No topic matches that yet.',
  /** The button that asks the server to build a topic for the query. */
  create: 'Create this topic',
  creating: 'Creating…',
  searchFailed: "Couldn't search topics.",
  /** The server does not support the query's topic (a 422). */
  notAvailable: 'Not available yet',
  /** Too many topics are being built for this user (a 429). */
  limit: 'You have too many topics being built. Try again later.',
  createFailed: "Couldn't create the topic. Try again.",
  /** The meta line of a topic that can be opened. */
  ready: 'Ready',
  /** The meta line of a topic that is still being built. */
  building: 'Being built',
  failed: 'Failed to build',
  /** Spoken label of a topic row that opens the topic. */
  openTopic: (title: string) => `Open ${title}`,
} as const;

/** The pending topic card (src/components/PendingTopic.tsx), README.md:163. */
export const pendingTopic = {
  kicker: 'Building your tree',
  queued: 'Waiting to start…',
  running: 'Reading sources…',
  done: 'Ready. Tap to open.',
  failed: "Couldn't build this topic.",
  timeout: 'Still building. Check back later.',
} as const;
