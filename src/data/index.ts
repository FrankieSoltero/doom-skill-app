// The app's entry to card data. Screens import `cardSource`, `loadSummary` and the card types from
// here.
import { api } from '../api/client';
import { config } from '../config';
import { activeTopic } from '../feed/useActiveTopic';
import {
  createApiSource,
  fetchSummary,
  sendFlag,
  type FlagReason,
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
export const cardSource: CardSource =
  client === null ? createFixtureSource() : createApiSource(client, activeTopic);

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

export type {
  Card,
  CheckpointCard,
  ConceptCard,
  ExerciseCard,
  FeedSet,
  PredictCard,
  QuizCard,
  ReviewCard,
  SourceLink,
  Summary,
  Topic,
} from './schema';
export type { FlagReason } from './apiSource';
export { FeedLoadError } from './source';
export type { CardSource } from './source';
