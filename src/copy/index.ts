/**
 * The one home of UI strings that do not come from card data (rule SS-8 in docs/standards.md).
 * Screens and components read their text from `copy` instead of writing it inline.
 *
 * Plain strings are values. A string that needs data is a function that returns the string, for
 * example `cardsLeft: (count: number) => ...`. Related strings may be grouped in nested objects;
 * `deepFreeze` freezes every level, and `as const` makes every level read-only to the compiler.
 * A screen's group may live in a sibling file of this folder (`topics.ts`, `profile.ts`), merged
 * into `copy` here; screens still read it through `copy`.
 */

import { flag } from './flag';
import { leaderboard } from './leaderboard';
import { levels } from './levels';
import { profile, reminder } from './profile';
import { qa } from './qa';
import { sources } from './sources';
import { explore, pendingTopic, topic, tree } from './topics';

/** The source sheet opened from a card's book icon (M9 plan H, spec 5.1). */
const source = {
  /** The book icon's spoken label. */
  action: 'Show me the source',
  /** The sheet's title. */
  title: 'Where this card comes from',
  /** Shown while the passages load. */
  loading: 'Finding the passage…',
  /** Shown when the passages could not be loaded. */
  unavailable: 'The passage is not available right now.',
  /** The heading over the passage the card was built from. */
  own: 'This card was built from',
  /** The heading over the other passages of the idea. */
  more: 'More from this idea',
  /** The heading over the card's source links. */
  links: 'Sources',
  /** A source link's spoken label. */
  open: 'Open the source',
};

/** The help sheet opened from a card's help icon (M9 plan H, spec 5.2). */
const help = {
  /** The help icon's spoken label. */
  action: 'Help with this card',
  /** The sheet's title. */
  title: 'Help with this card',
  /** The row that adds one more practice card. */
  testMe: 'Test me',
  /** The Test me row's hint line. */
  testMeHint: 'One more practice card on this idea',
  /** The row that adds the next idea's card. */
  deeper: 'Go deeper',
  /** The Go deeper row's hint line. */
  deeperHint: 'The next idea that builds on this one',
  /** Shown when the server has nothing to add. */
  nothing: 'Nothing more to add here',
  /** Shown when the set already holds its most added cards. */
  full: 'This set is full',
  /** Shown while a request is in flight. */
  adding: 'Adding…',
  /** Shown after a card was added to the set. */
  added: 'Added after this card',
  /** Shown when the request timed out and the card may already be added. */
  maybeAdded: 'The card may appear after a reload',
  /** Shown when the request failed for any other reason. */
  failed: 'Could not add a card right now',
};

/** Freezes every nested object under `value`. Functions and primitives are left as they are. */
function freezeChildren(value: object): void {
  const children: unknown[] = Object.values(value);
  for (const child of children) {
    if (typeof child === 'object' && child !== null) {
      freezeChildren(child);
      Object.freeze(child);
    }
  }
}

/** Freezes `value` and every object nested in it, so no level can be changed at run time. */
export function deepFreeze<T extends object>(value: T): Readonly<T> {
  freezeChildren(value);
  return Object.freeze(value);
}

export const copy = deepFreeze({
  appName: 'DoomSkill',
  gotIt: 'Got it',
  /** The label of the card button that moves on, README.md:74 and :111. */
  nextCard: 'Next card',
  /**
   * Spoken label of the feed pager's position control, which a screen reader adjusts to move
   * between cards (`position` counts from 1).
   */
  cardPosition: (position: number, total: number) => `Card ${String(position)} of ${String(total)}`,
  /** The toast shown when a swipe tries to leave an unanswered card, README.md:43. */
  answerToContinue: 'Answer this card to continue',
  /** Spoken label of an answer option shown as the correct answer. */
  optionCorrect: (label: string) => `${label}. Correct answer.`,
  /** Spoken label of an answer option the learner picked that is not correct. */
  optionWrong: (label: string) => `${label}. Not correct.`,
  /** The feed header's title on the Today screen. */
  today: 'Today',
  /** The Today screen while its first set loads. */
  loading: 'Loading…',
  /** The button that asks the card source again after a failed load. */
  retry: 'Retry',
  /** The Today screen when its first set failed to load. */
  loadFailed: "Couldn't load your cards.",
  /** The Today screen when the card source has no set to give. */
  nothingYet: 'Nothing to learn yet.',
  /**
   * The Today screen's end card offline: the server cannot be reached and every kept set is
   * answered (offline-topic plan O2).
   */
  connectForMore: 'Connect to get more cards',
  /**
   * Why an online-only control (Help, Ask, Flag, the Questions actions, the checkpoint's submit)
   * is disabled while the API cannot be reached (offline-topic plan O6).
   */
  needsConnection: 'Needs a connection',
  /** The Today screen with no active topic: nothing to ask the server for. */
  noTopic: 'Pick a topic to start learning.',
  /** The button under `noTopic`, to the Explore tab. */
  exploreTopics: 'Explore topics',
  /** The fallback card shown in place of a card that failed to render. */
  cardFailed: "This card couldn't be shown.",
  /** The whole screen when the app itself failed to render; Retry draws it again. */
  appFailed: 'Something went wrong.',
  /**
   * The whole screen when the build's configuration is missing or wrong (src/config.ts). Fixed
   * text: it never names the variable or shows its value. No Retry: only a new build fixes it.
   */
  configFailed: "The app isn't set up to reach its server.",
  /** The feed header's kicker on a day's first set, docs/design/card-feed/README.md:28. */
  kicker: (topic: string, day: number, horizon: number) =>
    `${topic.toUpperCase()} · DAY ${String(day)} OF ${String(horizon)}`,
  /** The feed header's kicker on a later set of the same day. */
  kickerWithSet: (topic: string, day: number, horizon: number, set: number) =>
    `${topic.toUpperCase()} · DAY ${String(day)} OF ${String(horizon)} · SET ${String(set)}`,
  /** Spoken label of the feed header's progress bar. */
  progressLabel: (done: number, total: number) => `${String(done)} of ${String(total)} cards done`,
  /** Spoken label of the feed header's streak chip. */
  streakLabel: (days: number) => `${String(days)} day streak`,
  /** The display name of each card type, shown in the card kicker, README.md:52. */
  cardTypes: {
    concept: 'Concept',
    quiz: 'Quiz',
    predict: 'Predict',
    cloze: 'Fill in',
    scenario: 'Scenario',
    numeric: 'Work it out',
    exercise: 'Exercise',
    review: 'Review',
    checkpoint: 'Checkpoint',
  },
  /**
   * A card's kicker: its type name and node, README.md:47 and :52. Case is kept; the kicker style
   * shows it uppercase.
   */
  cardKicker: (type: string, node: string) => `${type} · ${node}`,
  /** A card's place in its two-card sequence, after the node in its kicker: `1/2`. */
  cardKickerPart: (index: number, of: number) => `${String(index)}/${String(of)}`,
  /** The line under a card's kicker when the card may be off (card quality loop, spec 4). */
  card: {
    noticeRebuilding: "This card may be off; it's being rebuilt",
    noticeFlagged: 'This card was flagged',
  },
  /** A card's estimated time under two minutes, README.md:52 ("~40 S" by style). */
  seconds: (n: number) => `~${String(n)} s`,
  /** A card's estimated time from two minutes up, README.md:124 ("~3 MIN" by style). */
  minutes: (n: number) => `~${String(n)} min`,
  /** The label of a concept card's cycle tile, README.md:56 ("CYCLE 1" by style). */
  cycleLabel: (n: number) => `Cycle ${String(n)}`,
  /** The verdict that leads a choice card's explanation after a right pick, README.md:73. */
  correct: 'Correct.',
  /** The verdict that leads a choice card's explanation after a wrong pick, README.md:73. */
  notQuite: 'Not quite.',
  /**
   * A choice card's explanation led by its verdict in bold, README.md:73. The result is
   * bold-marked text (rule SS-11), drawn through `BoldText`.
   */
  verdict: (verdict: string, explanation: string) => `**${verdict}** ${explanation}`,
  /** What a screen reader says for the blank (`___`) of a cloze card's sentence. */
  blankSpoken: 'blank',
  /** The review card's reveal button, README.md:116. */
  recallThenReveal: 'Recall it, then tap to reveal',
  /** The caption over the review card's rating buttons, README.md:119 (reworded in M8). */
  howWell: 'How easily did it come back?',
  /** The line under the rating buttons for the first three review ratings made on the phone. */
  ratingHint: "Your answer decides when you'll see this again.",
  /**
   * When a review card was last seen, the node part of its kicker, README.md:115 ("SEEN 3 DAYS
   * AGO" by style). `days` is a whole number, 0 or more.
   */
  seenDaysAgo: (days: number) => {
    if (days === 0) return 'Seen today';
    if (days === 1) return 'Seen 1 day ago';
    return `Seen ${String(days)} days ago`;
  },
  /** Spoken label of a review rating button: its label and next interval, as the card gives them. */
  ratingLabel: (label: string, interval: string) => `${label}, next review in ${interval}`,
  /** One beat grid row as a screen reader says it: its sample name and its number of hits. */
  gridRow: (name: string, hits: number) =>
    hits === 1 ? `${name}: 1 hit` : `${name}: ${String(hits)} hits`,
  /** Spoken label of the beat grid, README.md:97-102. `rows` are `gridRow` strings, in order. */
  gridLabel: (rows: string[]) => `Beat grid. ${rows.join('. ')}`,
  /** The exercise card's play button, README.md:104. */
  play: 'Play',
  /** The exercise card's play button while playing, README.md:104. */
  stop: 'Stop',
  /** The exercise card's check button, README.md:105. */
  check: 'Check',
  /** The badge of an exercise that passes its check, README.md:107. */
  specMet: 'Spec met',
  /** The badge of an exercise that fails its check, README.md:108. */
  notYet: 'Not yet',
  /** Spoken label of the exercise card's code editor. */
  codeEditor: 'Code editor',
  /** The key above an editor's keyboard (iOS) that closes the keyboard. */
  done: 'Done',
  /** The code keypad's key that swaps it for the system keyboard (M9 plan K, P7). */
  keypadAbc: 'ABC',
  /** Spoken labels of the code keypad's delete and caret keys (P11). */
  keypadDelete: 'Delete',
  keypadLeft: 'Move left',
  keypadRight: 'Move right',
  /** The code keypad's action key: `run` on an exercise, `submit` on a checkpoint (P4). */
  keypadRun: '▶ Run',
  keypadSubmit: 'Submit',
  /** Spoken label of the swipe down that hides the code keypad (P7). */
  keypadHide: 'Hide keypad',
  /** Spoken names of the code keypad's key groups, by the group's `name` (P4). */
  keypadGroup: {
    calls: 'Sounds and calls',
    notation: 'Notation',
    methods: 'Methods',
    digits: 'Numbers',
  },
  /** The notice shown while the audio plays without its samples (no network). */
  audioNeedsConnection: 'Audio needs a connection',
  /** The notice shown when the audio player could not start or stopped working. */
  audioUnavailable: 'Audio unavailable',
  /** The label of the notice that shows an audio error. */
  audioError: 'Audio error',
  /** The audio error shown when the code is longer than the player accepts. */
  codeTooLong: 'The code is too long to play',
  /** The action that loads a fresh audio player after an error. */
  resetAudio: 'Reset audio',
  /**
   * A badge as a screen reader hears it: its label, then its message when it has one. `message`
   * is plain text; remove any bold markers first.
   */
  badgeSpoken: (label: string, message: string) =>
    message === '' ? label : `${label}. ${message}`,
  /** The node part of a checkpoint card's kicker, README.md:124 ("MILESTONE 1 OF 4" by style). */
  milestoneOf: (n: number, total: number) => `Milestone ${String(n)} of ${String(total)}`,
  /** The checkpoint card's button before a grade, README.md:136. */
  submitForGrading: 'Submit for grading',
  /** The checkpoint card's button while it grades, README.md:137. */
  grading: 'Grading against rubric…',
  /** The checkpoint card's button after a passing grade, README.md:140. */
  finishToday: 'Finish today',
  /** The written checkpoint card's editor: its label and its placeholder (M9 plan J). */
  yourAnswer: 'Your answer',
  /**
   * Shown on a written checkpoint card once its answer is sent: nothing is graded on the phone, and
   * the server's grade arrives under the card (M9 plan J).
   */
  sentForGrading: 'Sent for grading. Your result arrives in about a minute.',
  /**
   * What a tap on a written checkpoint card's task does: open the whole task in a sheet (M9 plan J
   * Task 8). A screen reader says it as the task's hint.
   */
  readTask: 'Read the task',
  /** The checkpoint card's button after a failing grade, README.md:140. */
  resubmit: 'Resubmit',
  /** The checkpoint score line of a passing grade, README.md:139. */
  passedOf: (n: number, total: number) => `Passed · ${String(n)} of ${String(total)}`,
  /** The checkpoint score line of a failing grade, README.md:139. */
  notYetOf: (n: number, total: number) => `Not yet · ${String(n)} of ${String(total)}`,
  /**
   * The checkpoint feedback for each grade outcome, after the prototype's `cpFeedback`
   * (reference/DoomSkill Card Feed v2.dc.html:588), written from the card's own values: `all`
   * from its milestone and the topic's milestone count, `pass` and `fail` from its threshold and
   * its rubric's size.
   */
  checkpoint: {
    all: (milestone: number, milestoneCount: number) =>
      milestone < milestoneCount
        ? `Every item met. Milestone ${String(milestone + 1)} is unlocked.`
        : 'Every item met. That was the last milestone.',
    pass: (threshold: number, rows: number) =>
      `Passes with ${String(threshold)} of ${String(rows)} needed. Meet the struck-out items to make it stronger.`,
    fail: (threshold: number, rows: number) =>
      `Needs at least ${String(threshold)} of ${String(rows)}. Check the struck-out items and resubmit.`,
    /** The quiet line under the on-phone result while the server grades the submission (M5). */
    detailPending: 'Getting detailed feedback…',
    /**
     * The one line shown when the server's grade will not come: a refused or failed submission,
     * no connection, or no grade within 2 minutes. Fixed text; the server's own is never shown.
     */
    detailUnavailable: "Detailed feedback isn't available right now.",
    /** The server's verdict, with its score as a whole percent when it gave one. */
    detailVerdict: (passed: boolean, percent: number | null) => {
      const verdict = passed ? 'Detailed grade: passed' : 'Detailed grade: not yet';
      return percent === null ? verdict : `${verdict} · ${String(percent)}%`;
    },
    /** One criterion of the server's grade: its name and its score as a whole percent. */
    detailCriterion: (name: string, percent: number) => `${name} · ${String(percent)}%`,
    /** Shown when the on-phone result and the server's grade differ. */
    detailDecides: 'Your milestone progress follows the detailed grade.',
  },
  /** Spoken label of a checkpoint rubric row: its label, then whether it was met. */
  rubricItem: (label: string, state: 'passed' | 'failed' | 'notGraded') => {
    if (state === 'passed') return `${label}. Passed.`;
    if (state === 'failed') return `${label}. Not met.`;
    return `${label}. Not graded yet.`;
  },
  /** The Summary card's kicker, README.md:145 ("DAY 4 COMPLETE"). */
  dayComplete: (day: number) => `DAY ${String(day)} COMPLETE`,
  /**
   * The words the Summary title spells a count with, `one` to `twenty` in order (the word for n
   * is at n - 1). Larger counts are written in digits. Lower case; the title capitalizes.
   */
  numberWords: [
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
    'twenty',
  ],
  /** The nouns the Summary title counts, singular for one. */
  summaryNouns: { card: 'card', cards: 'cards', minute: 'minute', minutes: 'minutes' },
  /** A count and its noun, as the Summary title writes them: "Six cards". */
  counted: (count: string, noun: string) => `${count} ${noun}`,
  /** The Summary title, README.md:146: two sentences, the cards, then the minutes. */
  summaryTitle: (cards: string, minutes: string) => `${cards}. ${minutes}.`,
  summary: {
    /** The Summary's points tile: the points the set's attempts earned (section points). */
    pointsGained: (n: number) => `+${String(n)} points`,
    /**
     * Beside it while some of those points are provisional, graded on the phone and waiting for
     * the server's replies (offline-topic plan O5).
     */
    syncing: 'syncing',
    /** Under it, the section of the set's last card: "Rhythm basics: 12 / 100 points". */
    sectionPoints: (title: string, earned: number, target: number) =>
      `${title}: ${String(earned)} / ${String(target)} points`,
  },
  /** The label of the Summary's streak tile, README.md:148. */
  dayStreak: 'day streak',
  /** A whole percent, as the Summary's progress tile shows it, README.md:149 ("34%"). */
  percent: (n: number) => `${String(n)}%`,
  /**
   * The label of the Summary's progress tile, README.md:149 ("topic progress, +3"): the change in
   * whole percent points, with a plus sign unless it is negative.
   */
  topicProgress: (delta: number) => `topic progress, ${delta < 0 ? '' : '+'}${String(delta)}`,
  /** The heading over the Summary's mastery rows, README.md:151. */
  masteryMoved: 'Mastery moved',
  /** A mastery row's change, README.md:151 ("0.42 → 0.61"): two decimals each. */
  masteryDelta: (from: number, to: number) => `${from.toFixed(2)} → ${to.toFixed(2)}`,
  /** Spoken label of a mastery row's bar. */
  masteryOf: (name: string) => `${name} mastery`,
  /**
   * The Summary's footer, README.md:152. The node is in bold markers (rule SS-11), drawn through
   * `BoldText`. Without a reminder time (`null`) the reminder phrase is left out.
   */
  tomorrow: (node: string, time: string | null) =>
    time === null ? `Tomorrow: **${node}**` : `Tomorrow: **${node}** · reminder at ${time}`,
  /** The Summary's button that loads the next set (spec section 1a). */
  keepGoing: 'Keep going',
  /** The Summary's button that switches to the Tree tab, README.md:152. */
  viewSkillTree: 'View skill tree',
  /** The Keep going button while the next set loads. */
  loadingMore: 'Loading…',
  /**
   * Shown in place of Keep going when no next set is open and no recall is due later (M8 spec,
   * section 5).
   */
  nothingLeft: "You've seen everything that's open today.",
  /**
   * Shown over Keep going when no next set is open: the whole minutes until the next recall
   * comes due (M8 spec, section 5), "1 minute" for one. Keep going stays, to ask again once the
   * recall is due (M8 final review, I2).
   */
  nothingLeftRecall: (minutes: number) =>
    `Nothing more is open right now. Your next recall is in ${String(minutes)} ${
      minutes === 1 ? 'minute' : 'minutes'
    }.`,
  /** Shown over Retry when the next set failed to load (spec section 1a). */
  couldNotLoadMore: "Couldn't load more cards.",
  /** Tab bar labels, docs/design/card-feed/README.md:32. */
  tabs: {
    today: 'Today',
    tree: 'Tree',
    explore: 'Explore',
    profile: 'Profile',
  },
  /**
   * The sign-in screens (app/(auth)): the email step, then the code step. Every failure shows a
   * fixed message from here, never the server's text, and a failure to send reads the same
   * whether or not the address has an account.
   */
  signIn: {
    title: 'Sign in',
    emailIntro: 'Enter your email address. We will send you a 6-digit code.',
    emailLabel: 'Email address',
    emailPlaceholder: 'you@example.com',
    sendCode: 'Send code',
    sending: 'Sending…',
    invalidEmail: 'Enter a valid email address.',
    sendFailed: "Couldn't send a code. Try again in a minute.",
    /** Shown on the email step after 5 wrong codes sent the person back to it. */
    tooManyTries: 'Too many wrong codes. Send a new one.',
    codeTitle: 'Enter your code',
    codeIntro: (email: string) => `We sent a 6-digit code to ${email}.`,
    codeLabel: '6-digit code',
    verify: 'Sign in',
    verifying: 'Checking…',
    wrongCode: "That code didn't work. Check it, or send a new one.",
    verifyFailed: "Couldn't reach the server. Try again.",
    resend: 'Send a new code',
    resendIn: (seconds: number) => `You can send a new code in ${String(seconds)} s.`,
    codeResent: 'A new code is on its way.',
    changeEmail: 'Use a different email',
  },
  explore,
  pendingTopic,
  topic,
  tree: {
    ...tree,
    /** A section's points, and the topic's (the sum of its sections): "12 / 100 points". */
    sectionPoints: (earned: number, target: number) =>
      `${String(earned)} / ${String(target)} points`,
  },
  leaderboard,
  levels,
  profile,
  reminder,
  flag,
  sources,
  source,
  help,
  qa,
} as const);
