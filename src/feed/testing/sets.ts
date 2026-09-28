// Test support: one card of each kind and a builder for feed sets, so the gating and store tests
// share their data instead of repeating it. Not app code.
import type {
  Card,
  CheckpointCard,
  ConceptCard,
  ExerciseCard,
  FeedSet,
  PredictCard,
  QuizCard,
  ReviewCard,
} from '../../data';

const concept: ConceptCard = {
  type: 'concept',
  node: 'mini-notation',
  estSeconds: 30,
  title: 'Steps in a cycle',
  body: 'Each word is one step.',
  snippet: 's("bd sd")',
  snippetComment: '',
  cycles: ['bd sd'],
};

const quiz: QuizCard = {
  type: 'quiz',
  node: 'mini-notation',
  estSeconds: 20,
  title: 'How many steps?',
  options: ['Two', 'Four'],
  correct: 0,
  explanation: 'Two words, two steps.',
};

const predict: PredictCard = {
  type: 'predict',
  node: 'mini-notation',
  estSeconds: 25,
  title: 'What plays?',
  code: 's("bd*2")',
  options: ['One kick', 'Two kicks'],
  correct: 1,
  explanation: '`*2` repeats the step.',
};

const exercise: ExerciseCard = {
  type: 'exercise',
  lang: 'strudel',
  node: 'mini-notation',
  estSeconds: 90,
  title: 'Add a snare',
  starterCode: 's("bd")',
  checks: [{ kind: 'contains', value: 'sd', ignoreWhitespace: true }],
  passMsg: 'Nice.',
  failMsg: 'Add `sd`.',
};

const review: ReviewCard = {
  type: 'review',
  node: 'mini-notation',
  lastSeenDays: 2,
  estSeconds: 15,
  prompt: 'What does `~` do?',
  answer: 'A rest.',
  snippet: 's("bd ~")',
  ratings: [['Again', 'soon']],
};

const checkpoint: CheckpointCard = {
  type: 'checkpoint',
  milestone: 1,
  milestoneCount: 3,
  estSeconds: 120,
  title: 'Build a beat',
  starterCode: 's("bd")',
  passThreshold: 1,
  rubric: [{ label: 'Kick', regex: 'bd' }],
};

/** One card of each kind, keyed by its `type`. */
export const cardsByType = { concept, quiz, predict, exercise, review, checkpoint };

/** A feed set whose topic has the given streak and whose cards are `cards`. */
export function makeSet(streak: number, cards: Card[]): FeedSet {
  return {
    topic: {
      slug: 'strudel',
      title: 'Strudel',
      day: 1,
      horizonDays: 30,
      streak,
      progress: 0,
    },
    setNumber: 1,
    cards,
    summary: {
      title: 'Done',
      progressDelta: 0.1,
      moved: [],
      tomorrow: 'More rhythm.',
      reminder: 'See you tomorrow.',
    },
  };
}
