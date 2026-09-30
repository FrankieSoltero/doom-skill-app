// The app's entry to card data. Screens import `cardSource`, `loadSummary` and the card types from
// here.
import { api } from '../api/client';
import { config } from '../config';
import { createApiSource, fetchSummary, type SummaryAsk } from './apiSource';
import { createFixtureSource } from './fixtureSource';
import type { Summary } from './schema';
import type { CardSource } from './source';

/**
 * The learner's active topic. None yet: choosing one on the Explore tab and keeping it comes with
 * the topic screens (M4 app wiring, Task 12), so until then the API source fails with `noTopic`
 * and the feed screen sends the learner to Explore.
 */
const noActiveTopic = (): string | null => null;

/** The API client when the configuration names the API; `null` with the demo sets. */
const client = config.dataSource === 'api' ? api : null;

/**
 * The one place a card source is chosen, by `config.dataSource`: the API's feed for `api`, the
 * bundled demo sets otherwise (and in tests). `api` is null unless the configuration names the API
 * and is valid; with an invalid one the root layout shows its message instead of any screen.
 */
export const cardSource: CardSource =
  client === null ? createFixtureSource() : createApiSource(client, noActiveTopic);

/**
 * Reads the recorded summary of a set the API served (`GET /feed/summary`); `null` with the demo
 * sets, which have no API and nothing recorded.
 */
export const loadSummary: ((asked: SummaryAsk) => Promise<Summary>) | null =
  client === null ? null : (asked) => fetchSummary(client, asked);

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
