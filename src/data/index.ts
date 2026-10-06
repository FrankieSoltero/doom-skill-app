// The app's entry to card data. Screens import `cardSource`, `loadSummary`, `placement` and the
// card types from here.
import { api } from '../api/client';
import { config } from '../config';
import { activeTopic } from '../feed/useActiveTopic';
import {
  createApiSource,
  fetchPlacement,
  fetchSummary,
  resetPlacement,
  sendFlag,
  sendPlacement,
  type FlagReason,
  type PlacementLoad,
  type PlacementOutcome,
  type PlacementSubmit,
  type ResetOutcome,
  type SummaryAsk,
} from './apiSource';
import { createFixtureSource } from './fixtureSource';
import type { Summary } from './schema';
import type { CardSource } from './source';

/** The API client when the configuration names the API; `null` with the demo sets. */
const client = config.dataSource === 'api' ? api : null;

/**
 * The one place a card source is chosen, by `config.dataSource`: the API's feed for `api`, the
 * bundled demo sets otherwise (and in tests). `api` is null unless the configuration names the API
 * and is valid; with an invalid one the root layout shows its message instead of any screen. The
 * API source asks for the learner's active topic (src/feed/useActiveTopic.ts), read on every
 * request; with none it fails with `noTopic`, and the feed screen sends the learner to Explore.
 */
const apiSource = client === null ? null : createApiSource(client, activeTopic);
export const cardSource: CardSource = apiSource ?? createFixtureSource();

/**
 * The date and number of the set the API served last, for a card added to it (`POST
 * /feed/extra`); `null` before the first set and with the demo sets, which no API served.
 */
export function currentSet(): { feedDate: string; setNumber: number } | null {
  return apiSource?.getCurrentSet() ?? null;
}

/**
 * Reads the recorded summary of a set the API served (`GET /feed/summary`); `null` with the demo
 * sets, which have no API and nothing recorded.
 */
export const loadSummary: ((asked: SummaryAsk) => Promise<Summary>) | null =
  client === null ? null : (asked) => fetchSummary(client, asked);

/** Sends a learner's flag on a card the API served; rejects on any failure. */
export type FlagSender = (cardId: string, reason: FlagReason) => Promise<void>;

/**
 * Flags a card the API served (`POST /cards/{id}/flag`), once; `null` with the demo sets, whose
 * cards the API never served, so the app shows no flag action on them.
 */
export const flagCard: FlagSender | null =
  client === null ? null : (cardId, reason) => sendFlag(client, cardId, reason);

/** The placement quiz's calls for a topic (src/data/apiSource.ts). */
export type Placement = {
  load: (slug: string) => Promise<PlacementLoad>;
  send: (slug: string, submit: PlacementSubmit) => Promise<PlacementOutcome>;
  reset: (slug: string) => Promise<ResetOutcome>;
};

/**
 * The placement quiz (K19) through the API; `null` with the demo sets, which have no placement,
 * so the app shows no placement screen and no reset.
 */
export const placement: Placement | null =
  client === null
    ? null
    : {
        load: (slug) => fetchPlacement(client, slug),
        send: (slug, submit) => sendPlacement(client, slug, submit),
        reset: (slug) => resetPlacement(client, slug),
      };

export type {
  Card,
  CheckpointCard,
  ClozeCard,
  ConceptCard,
  ExerciseCard,
  FeedSet,
  NumericCard,
  PlacementCard,
  PlacementQuiz,
  PlacementResult,
  PredictCard,
  QuizCard,
  ReviewCard,
  ScenarioCard,
  SourceLink,
  Summary,
  Topic,
} from './schema';
export type { FlagReason } from './apiSource';
export { FeedLoadError } from './source';
export type { CardSource } from './source';
