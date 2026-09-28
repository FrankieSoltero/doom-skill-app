// The app's entry to card data. Screens import `cardSource` and the card types from here.
import { createFixtureSource } from './fixtureSource';
import type { CardSource } from './source';

/** The one place a card source is chosen. Swap the implementation here and nowhere else. */
export const cardSource: CardSource = createFixtureSource();

export type {
  Card,
  CheckpointCard,
  ConceptCard,
  ExerciseCard,
  FeedSet,
  PredictCard,
  QuizCard,
  ReviewCard,
  Summary,
  Topic,
} from './schema';
export type { CardSource } from './source';
