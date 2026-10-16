/**
 * UI strings of the topic screens: the Explore tab, the pending topic card, the topic detail
 * screen and the Tree tab. Part of `copy` (src/copy/index.ts), which freezes them; read them
 * through `copy`, not from here.
 */

import { levels } from './levels';

/** A topic outside the registry whose sources a person has not approved yet (status `proposed`). */
const WAITING_FOR_APPROVAL = 'Waiting for approval';

/** A topic whose sources wait for a person's review (job stage `waiting`, topic `proposed`). */
const WAITING_FOR_REVIEW = 'Waiting for a review';

/** A build that failed for a reason the learner cannot act on (any reason but `invalid_output`). */
const BUILD_FAILED = 'Build failed — try again later';

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
  creating: 'Creating…',
  searchFailed: "Couldn't search topics.",
  /** The server does not support the query's topic (a 422). */
  notAvailable: 'Not available yet',
  /** Too many topics are being built for this user (a 429). */
  limit: 'You have too many topics being built. Try again later.',
  createFailed: "Couldn't create the topic. Try again.",
  /** A catalog suggestion's group chip, by its group (`code`, `prose`, `quantitative`). */
  group: { code: 'code', prose: 'prose', quantitative: 'quantitative' },
  /** No catalog topic and no topic matches the query; the Create button follows. */
  notInCatalog: 'Not in the catalog yet — you can still request it',
  /** Spoken label of a topic row that opens the topic. */
  openTopic: (title: string) => `Open ${title}`,
  /** The heading over the learner's enrollments, shown before anything is typed. */
  myTopics: 'My topics',
  /** Spoken label of the tick on a completed enrollment's row. */
  completed: 'Done',
  /** The tick drawn on a completed enrollment's row in place of its percent. */
  tick: '✓',
  /** The enrollments could not be read; the idle state shows under it. */
  myTopicsFailed: "Couldn't load your topics.",
  /** An enrollment's progress as a whole percent. */
  progress: (pct: number) => `${String(pct)}%`,
  /** An enrollment's row as a screen reader hears it: its title, level and percent or `completed`. */
  rowLabel: (title: string, level: number, state: string) =>
    `${title}, ${levels.badge(level)}, ${state}`,
} as const;

/** The pending topic card (src/components/PendingTopic.tsx), README.md:163. */
export const pendingTopic = {
  kicker: 'Building your tree',
  /** The lines by the job's status, from a server that does not report the stage. */
  waitingToStart: 'Waiting to start…',
  running: 'Reading sources…',
  done: 'Ready. Tap to open.',
  /** A proposed topic whose sources were proposed: a person approves them next. */
  proposed: WAITING_FOR_APPROVAL,
  couldNotBuild: "Couldn't build this topic.",
  timeout: 'Still building. Check back later.',
  /** A queued job with `n ≥ 1` queued jobs before it (Explore plan, Task 6). */
  queuedAhead: (n: number) => `Queued — ${String(n)} ahead`,
  /** A queued job first in the queue. */
  queued: 'Queued',
  /** The line by the job's stage, from a server that reports it. */
  stage: {
    resolving: 'Resolving sources',
    ingesting: 'Reading sources',
    synthesizing: 'Building the tree',
    generating: 'Writing cards',
    waiting: WAITING_FOR_REVIEW,
  },
  /** A failed build by the job's reason; never the reason itself, which is internal. */
  failed: {
    invalidOutput: "Couldn't make sense of that text — try a suggestion",
    other: BUILD_FAILED,
  },
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
  /** A proposed topic: its sources wait for a person's review. */
  proposed: WAITING_FOR_REVIEW,
  /** A topic whose build failed; the page knows no reason. */
  failed: BUILD_FAILED,
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
