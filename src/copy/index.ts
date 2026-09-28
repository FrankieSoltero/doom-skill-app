/**
 * The one home of UI strings that do not come from card data (rule SS-8 in docs/standards.md).
 * Screens and components read their text from `copy` instead of writing it inline.
 *
 * Plain strings are values. A string that needs data is a function that returns the string, for
 * example `cardsLeft: (count: number) => ...`. Related strings may be grouped in nested objects;
 * `deepFreeze` freezes every level, and `as const` makes every level read-only to the compiler.
 */

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
  appName: 'LearnLoop',
  gotIt: 'Got it',
  /** A button's label, and the feed pager's accessibility action that moves to the next card. */
  nextCard: 'Next card',
  /** The feed pager's accessibility action that moves back one card. */
  previousCard: 'Previous card',
  /** The toast shown when a swipe tries to leave an unanswered card, README.md:43. */
  answerToContinue: 'Answer this card to continue',
  /** Spoken label of an answer option shown as the correct answer. */
  optionCorrect: (label: string) => `${label}. Correct answer.`,
  /** Spoken label of an answer option the learner picked that is not correct. */
  optionWrong: (label: string) => `${label}. Not correct.`,
  /** The Today screen's text until the feed replaces it, and the feed header's title. */
  today: 'Today',
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
  /** Tab bar labels, docs/design/card-feed/README.md:32. */
  tabs: {
    today: 'Today',
    tree: 'Tree',
    explore: 'Explore',
    profile: 'Profile',
  },
  /** Titles of the placeholder tabs (spec section 10 approves a title only). */
  placeholder: {
    tree: 'Skill tree',
    explore: 'Explore',
    profile: 'Profile',
  },
} as const);
