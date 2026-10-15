// Test support: one card of each kind and a builder for feed sets, so the gating and store tests
// share their data instead of repeating it. Not app code.
import type {
  Card,
  CheckpointCard,
  ClozeCard,
  ConceptCard,
  ExerciseCard,
  FeedSet,
  NumericCard,
  PredictCard,
  QuizCard,
  ReviewCard,
  ScenarioCard,
} from '../../data';

const concept: ConceptCard = {
  type: 'concept',
  points: 0,
  seenPoints: 2,
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
  points: 5,
  node: 'mini-notation',
  estSeconds: 20,
  title: 'How many steps?',
  options: ['Two', 'Four'],
  correct: 0,
  explanation: 'Two words, two steps.',
};

const predict: PredictCard = {
  type: 'predict',
  points: 5,
  node: 'mini-notation',
  estSeconds: 25,
  title: 'What plays?',
  code: 's("bd*2")',
  options: ['One kick', 'Two kicks'],
  correct: 1,
  explanation: '`*2` repeats the step.',
};

// A prose topic's two choice cards (M9 plan C): a sentence with a blank, and a situation.
const cloze: ClozeCard = {
  type: 'cloze',
  points: 5,
  node: 'photosynthesis',
  estSeconds: 30,
  title: 'Fill in the blank',
  text: 'Photosynthesis turns light energy into ___ energy stored in sugar.',
  options: ['chemical', 'thermal', 'nuclear', 'kinetic'],
  correct: 0,
  explanation: 'The plant stores it in the **chemical bonds** of glucose.',
};

const scenario: ScenarioCard = {
  type: 'scenario',
  points: 5,
  node: 'photosynthesis',
  estSeconds: 45,
  title: 'What happens next?',
  situation: 'A potted plant is moved from a sunny window into a dark cupboard for a week.',
  options: ['It makes less sugar', 'It makes more sugar', 'Nothing changes', 'It grows faster'],
  correct: 0,
  explanation: 'Without light, **photosynthesis** slows, so the plant makes less sugar.',
};

// A quantitative topic's choice card (M9 plan D): a problem to work out; code computed the answer.
const numeric: NumericCard = {
  type: 'numeric',
  points: 5,
  node: 'unit conversion',
  estSeconds: 60,
  title: 'How fast in m/s?',
  problem: 'A car travels at 54 km/h. What is its speed in metres per second?',
  options: ['15 m/s', '150 m/s', '19.4 m/s', '1.5 m/s'],
  correct: 0,
  explanation: 'Divide by 3.6: 54 / 3.6 = **15**',
};

const exercise: ExerciseCard = {
  type: 'exercise',
  points: 8,
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
  points: 3,
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
  points: 50,
  milestone: 1,
  milestoneCount: 3,
  estSeconds: 120,
  title: 'Build a beat',
  starterCode: 's("bd")',
  passThreshold: 1,
  rubric: [{ label: 'Kick', regex: 'bd' }],
};

/** One card of each kind, keyed by its `type`. */
export const cardsByType = {
  concept,
  quiz,
  predict,
  cloze,
  scenario,
  numeric,
  exercise,
  review,
  checkpoint,
};

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
