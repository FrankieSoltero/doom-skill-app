// A CardSource over the API's feed (`GET /feed/today` and `GET /feed/next`), through the app's
// one API client (rule SS-13), whose types come from the generated `schema.d.ts` (rule SS-2).
// Every answer is untrusted: its keys are mapped (`mapFeed`) and it is parsed with the demo sets'
// schema before a screen sees it, which here also requires the set's date (`apiSetSchema`). A card
// the app cannot show is dropped from the set, and the set names its id in `droppedIds`, so the
// feed session records it as skipped and the server can finish the set. The recorded summary of a stored set (`GET /feed/summary`) is read the
// same way (`fetchSummary`). A learner's flag on a card is sent from here too (`sendFlag`), and so
// are the placement quiz's three calls (`fetchPlacement`, `sendPlacement`, `resetPlacement`).
import type { z, ZodType } from 'zod';

import type { createApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { components } from '../api/schema';
import { logWarning } from '../log';
import { mapFeed } from './mapFeed';
import {
  apiSetSchema,
  placementQuizSchema,
  placementResultSchema,
  summarySchema,
  type PlacementQuiz,
  type PlacementResult,
  type Summary,
} from './schema';
import { FeedLoadError, type CardSource } from './source';

type ApiClient = ReturnType<typeof createApiClient>;

type FeedPath = '/feed/today' | '/feed/next';

/** What an attempt at a card of the served set must name: the set's date and its number. */
type CurrentSet = { feedDate: string; setNumber: number };

type ApiSet = z.infer<typeof apiSetSchema>;

/** The API's 409 on `GET /feed/next`: the current set still has a card with no attempt. */
function isSetUnfinished(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'conflict';
}

/**
 * The FeedLoadError for a failed request: an ApiError's kind, which the feed screen's error and
 * Retry already handle, or `unknown` for anything else (an answer that is not JSON). Its message
 * names the kind only, never the answer's text.
 */
function loadErrorFrom(error: unknown): FeedLoadError {
  if (error instanceof ApiError) {
    return new FeedLoadError(`Feed request failed: ${error.kind}`, {
      kind: error.kind,
      cause: error,
    });
  }
  return new FeedLoadError('Feed request failed', { kind: 'unknown' });
}

/** How a refused answer is logged (`event`) and named in its error's message (`label`). */
type Refusal = { event: string; label: string };

const SET_REFUSED: Refusal = { event: 'feed_invalid', label: 'Card set' };
const SUMMARY_REFUSED: Refusal = { event: 'summary_invalid', label: 'Summary' };

/**
 * An answer, its keys mapped, parsed with `schema`. An answer the schema refuses is a
 * FeedLoadError of kind `schema`: the paths of the fields at fault are logged and put in its
 * message, never their content.
 */
function parsed<T>(schema: ZodType<T>, data: unknown, refusal: Refusal): T {
  const result = schema.safeParse(mapFeed(data));
  if (result.success) {
    return result.data;
  }
  const paths = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join('; ');
  logWarning(refusal.event, { paths });
  throw new FeedLoadError(`${refusal.label} failed validation at ${paths}`, { kind: 'schema' });
}

/** Which stored set's recorded summary to ask for: its topic, number and date. */
export type SummaryAsk = { topic: string; setNumber: number; feedDate: string };

/**
 * The recorded summary of a stored set, from its attempts on the server (`GET /feed/summary`).
 * Fails as `getNextSet` does: an ApiError's kind, or `schema` for an answer the schema refuses.
 */
export async function fetchSummary(api: ApiClient, asked: SummaryAsk): Promise<Summary> {
  const query = { topic: asked.topic, set: asked.setNumber, date: asked.feedDate };
  const data = await api
    .GET('/feed/summary', { params: { query } })
    .then((answer) => answer.data)
    .catch((error: unknown) => {
      throw loadErrorFrom(error);
    });
  return parsed(summarySchema, data, SUMMARY_REFUSED);
}

/** Why a learner flags a card: one of the API's four reasons. */
export type FlagReason = components['schemas']['FlagReason'];

/**
 * Sends the learner's flag on a card (`POST /cards/{id}/flag`, a 204). The client never retries
 * a POST, and nothing here does: a flag is sent once. Rejects as the client does on any failure.
 */
export async function sendFlag(api: ApiClient, cardId: string, reason: FlagReason): Promise<void> {
  await api.POST('/cards/{card_id}/flag', {
    params: { path: { card_id: cardId } },
    body: { reason },
  });
}

const QUIZ_REFUSED: Refusal = { event: 'placement_invalid', label: 'Placement' };
const RESULT_REFUSED: Refusal = { event: 'placement_invalid', label: 'Placement result' };

/** True for an ApiError of `kind`. */
function isApiKind(error: unknown, kind: ApiError['kind']): boolean {
  return error instanceof ApiError && error.kind === kind;
}

/** The placement set, or `placed` when the enrollment has a placement already (a 409). */
export type PlacementLoad = { kind: 'quiz'; quiz: PlacementQuiz } | { kind: 'placed' };

/**
 * The learner's placement set for `slug` (`GET /topics/{slug}/placement`). A 409 (the stored
 * result: placed or skipped already) reads as `placed`; the client does not read its body. Any
 * other failure rejects: an ApiError, or a FeedLoadError of kind `schema` for a set the schema
 * refuses.
 */
export async function fetchPlacement(api: ApiClient, slug: string): Promise<PlacementLoad> {
  try {
    const { data } = await api.GET('/topics/{slug}/placement', { params: { path: { slug } } });
    return { kind: 'quiz', quiz: parsed(placementQuizSchema, data, QUIZ_REFUSED) };
  } catch (error) {
    if (isApiKind(error, 'conflict')) return { kind: 'placed' };
    throw error;
  }
}

/** What the learner sends: an option for each card (by its id), or a skip. */
export type PlacementSubmit = { answers: { cardId: string; choice: number }[] } | { skip: true };

/** The result of a new placement, or `placed` when one was stored before (any 409). */
export type PlacementOutcome = { kind: 'result'; result: PlacementResult } | { kind: 'placed' };

/**
 * Sends the learner's answers, or the skip (`POST /topics/{slug}/placement`), once. A 409 reads
 * as `placed`: the stored result, or the refusal of an enrollment with an attempt already, which
 * also means the quiz is over. Any other failure rejects as `fetchPlacement` does.
 */
export async function sendPlacement(
  api: ApiClient,
  slug: string,
  submit: PlacementSubmit,
): Promise<PlacementOutcome> {
  const body =
    'skip' in submit
      ? { skip: true as const }
      : { answers: submit.answers.map(({ cardId, choice }) => ({ card_id: cardId, choice })) };
  try {
    const { data } = await api.POST('/topics/{slug}/placement', {
      params: { path: { slug } },
      body,
    });
    return { kind: 'result', result: parsed(placementResultSchema, data, RESULT_REFUSED) };
  } catch (error) {
    if (isApiKind(error, 'conflict')) return { kind: 'placed' };
    throw error;
  }
}

/** A reset's outcome: done, no placement to reset (a 409), or the daily limit (a 429). */
export type ResetOutcome = 'reset' | 'nothing' | 'limit';

/**
 * Undoes the learner's placement in `slug` (`POST /topics/{slug}/placement/reset`), once. Any
 * failure other than a 409 or a 429 rejects with its ApiError.
 */
export async function resetPlacement(api: ApiClient, slug: string): Promise<ResetOutcome> {
  try {
    await api.POST('/topics/{slug}/placement/reset', { params: { path: { slug } } });
    return 'reset';
  } catch (error) {
    if (isApiKind(error, 'conflict')) return 'nothing';
    if (isApiKind(error, 'rateLimited')) return 'limit';
    throw error;
  }
}

/**
 * A card source over the API for the active topic, `getTopic()`, read on every call.
 *
 * - The first set served for a topic comes from `GET /feed/today`; every later one from
 *   `GET /feed/next`. A failed call does not move on, so Retry asks for the same set again.
 * - A 204 answers `null`: nothing to serve.
 * - A 409 from next (the set is unfinished) serves the current set again from today.
 * - No active topic fails with kind `noTopic`, before any request.
 * - Any ApiError fails with its kind; the client has already applied its time limit and retries.
 * - A set with cards the app cannot show is served without them, their ids in `droppedIds`.
 * - `currentSet()` gives the served set's date (the API's: the date the server stored it for, in
 *   the user's timezone) and number, for the attempts at its cards; `null` before the first set.
 *   `getCurrentSet()` gives the same, for a card added to the running set (`POST /feed/extra`).
 *
 * Nothing is cancelled when the feed screen goes: the session keeps a set that arrives late.
 */
export function createApiSource(
  api: ApiClient,
  getTopic: () => string | null,
): CardSource & {
  currentSet: () => CurrentSet | null;
  getCurrentSet: () => CurrentSet | null;
} {
  let served: { topic: string; set: CurrentSet } | null = null;
  const current = () => served?.set ?? null;

  const get = async (path: FeedPath, topic: string): Promise<unknown> => {
    const { data } = await api.GET(path, { params: { query: { topic } } });
    return data;
  };
  const ask = async (topic: string): Promise<unknown> => {
    if (served?.topic !== topic) {
      return get('/feed/today', topic);
    }
    try {
      return await get('/feed/next', topic);
    } catch (error) {
      if (isSetUnfinished(error)) {
        return get('/feed/today', topic);
      }
      throw error;
    }
  };

  return {
    async getNextSet() {
      const topic = getTopic();
      if (topic === null) {
        throw new FeedLoadError('No active topic', { kind: 'noTopic' });
      }
      const data = await ask(topic).catch((error: unknown) => {
        throw loadErrorFrom(error);
      });
      if (data === undefined) {
        return null;
      }
      const set: ApiSet = parsed(apiSetSchema, data, SET_REFUSED);
      served = { topic, set: { feedDate: set.feedDate, setNumber: set.setNumber } };
      return set;
    },
    currentSet: current,
    getCurrentSet: current,
  };
}
