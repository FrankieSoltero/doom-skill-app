/**
 * UI strings of the topic screens: the Explore tab, the pending topic card, the topic detail
 * screen and the Tree tab. Part of `copy` (src/copy/index.ts), which freezes them; read them
 * through `copy`, not from here.
 */

/** A topic outside the registry whose sources a person has not approved yet (status `proposed`). */
const WAITING_FOR_APPROVAL = 'Waiting for approval';

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
  /** The meta line of a proposed topic. */
  proposed: WAITING_FOR_APPROVAL,
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
  /** A proposed topic whose sources were proposed: a person approves them next. */
  proposed: WAITING_FOR_APPROVAL,
  failed: "Couldn't build this topic.",
  timeout: 'Still building. Check back later.',
} as const;

/** The topic detail screen (app/topic/[slug].tsx). */
export const topic = {
  /** Spoken label of the back button. */
  back: 'Back',
  kicker: 'Topic',
  endState: 'Where you will end up',
  milestones: 'Milestones',
  /** A milestone row as a screen reader hears it. */
  milestone: (position: number, title: string) => `Milestone ${String(position)}: ${title}`,
  start: 'Start',
  starting: 'Starting…',
  loadFailed: "Couldn't load this topic.",
  notFound: 'This topic does not exist.',
  /** The topic has no tree yet: it cannot be started. */
  notReady: 'This topic is still being built. Check back soon.',
  /** A proposed topic: its sources wait for a person's approval. */
  proposed: WAITING_FOR_APPROVAL,
  enrollFailed: "Couldn't start this topic. Try again.",
} as const;

/** The Tree tab (app/(tabs)/tree.tsx), README.md:156-160. */
export const tree = {
  /** The title before a topic is chosen. */
  title: 'Skill tree',
  kicker: 'Skill tree',
  /** No active topic: the button under it opens Explore (`copy.exploreTopics`). */
  noTopic: 'Pick a topic to see its skill tree.',
  loadFailed: "Couldn't load the skill tree.",
  /** The topic's tree is not built yet (a 409). */
  notReady: 'This skill tree is still being built.',
  empty: 'This topic has no skills yet.',
  /** The overall bar's spoken label. */
  overall: 'Topic progress',
  /** The section of nodes that belong to no milestone. */
  otherSkills: 'Other skills',
  /** A milestone whose every node is locked, at the right of its header. */
  locked: 'Locked',
  /** A node row as a screen reader hears it. */
  node: (title: string, percent: number, locked: boolean) =>
    locked ? `${title}, locked` : `${title}, ${String(percent)}% mastered`,
} as const;
