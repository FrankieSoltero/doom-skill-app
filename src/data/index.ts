// The app's entry to card data. Screens import `cardSource` and the card types from here.
import { api } from '../api/client';
import { config } from '../config';
import { createApiSource } from './apiSource';
import { createFixtureSource } from './fixtureSource';
import type { CardSource } from './source';

/**
 * The learner's active topic. None yet: choosing one on the Explore tab and keeping it comes with
 * the topic screens (M4 app wiring, Task 12), so until then the API source fails with `noTopic`
 * and the feed screen sends the learner to Explore.
 */
const noActiveTopic = (): string | null => null;

/**
 * The one place a card source is chosen, by `config.dataSource`: the API's feed for `api`, the
 * bundled demo sets otherwise (and in tests). `api` is null unless the configuration names the API
 * and is valid; with an invalid one the root layout shows its message instead of any screen.
 */
export const cardSource: CardSource =
  config.dataSource === 'api' && api !== null
    ? createApiSource(api, noActiveTopic)
    : createFixtureSource();

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
export { FeedLoadError } from './source';
export type { CardSource } from './source';
