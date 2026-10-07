/**
 * UI strings of the peer questions: the ask sheet opened from a card's help sheet, the card's
 * questions, the Questions tab and its inbox, and the answer controls. Part of `copy`
 * (src/copy/index.ts), which freezes them; read them through `copy`, not from here.
 */

/** The peer questions (M10 plan Q, Task 8; spec 3.4). */
export const qa = {
  /** The help sheet's row that opens the ask sheet, and the ask sheet's title. */
  ask: 'Ask a question',
  /** The ask row's hint line. */
  askHint: 'Learners further along can answer',
  /** The question field's placeholder. */
  askPlaceholder: 'What are you stuck on?',
  /** The button that sends the question. */
  send: 'Ask',
  /** The heading over the passages found for the question. */
  passagesTitle: 'From the sources',
  /** The heading over the card's questions. */
  questionsTitle: 'Questions on this card',
  /** Shown when the card has no question. */
  noQuestions: 'No questions yet.',
  /** The author of a question or an answer who did not opt in to show a name. */
  aLearner: 'A learner',
  /** The author of the learner's own question or answer. */
  you: 'You',
  /** The Questions tab's label. */
  tab: 'Questions',
  /** The Questions screen's title. */
  inboxTitle: 'Questions',
  /** The heading over the questions the learner can answer. */
  toAnswer: 'You can answer',
  /** The heading over the learner's own questions that have an answer. */
  answered: 'Answers to your questions',
  /** Shown when the inbox holds nothing. */
  inboxEmpty:
    'Nothing to answer right now. Pass a milestone to see questions from learners behind you.',
  /** The answer field's placeholder. */
  answerPlaceholder: 'Write an answer',
  /** The button that sends the answer. */
  sendAnswer: 'Answer',
  /** The asker's button that accepts an answer. */
  accept: 'Accept',
  /** The badge of the accepted answer. */
  accepted: 'Accepted',
  /** The button that marks an answer helpful. */
  helpful: 'Helpful',
  /** An answer's count of helpful votes. */
  helpfulCount: (n: number) => `${String(n)} found this helpful`,
  /** The button that flags a question or an answer. */
  flag: 'Flag',
  /** Shown once the learner flagged it. */
  flagged: 'Flagged',
  /** The learner's own question or answer: the delete button (decision Q13). */
  remove: 'Delete',
  /** The delete button after one tap: a second tap deletes. */
  removeAgain: 'Delete? Tap again',
  /** The author's own item that flags hid. */
  hiddenPending: 'Hidden pending review',
  /** Shown on a 429: the day's questions or answers are used. */
  rateLimited: "You've reached today's limit.",
  /** Shown on a 403. */
  notAllowed: "You can't do that here.",
  /** Shown when a question's text was refused (a 422). */
  textRefused: 'Keep it to plain text, 2–300 characters, no links.',
  /** Shown when an answer's text was refused (a 422). */
  answerRefused: 'Keep it to plain text, 2–600 characters, no links.',
  /** Shown on any other failure. */
  failed: "Couldn't send. Try again.",
  /** The points an accepted or helpful answer earned. */
  points: (n: number) => `+${String(n)} points`,
} as const;
