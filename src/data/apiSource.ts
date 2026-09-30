// A CardSource over the API's feed (`GET /feed/today` and `GET /feed/next`), through the app's
// one API client (rule SS-13), whose types come from the generated `schema.d.ts` (rule SS-2).
// Every answer is untrusted: its keys are mapped (`mapFeed`) and it is parsed with the same
// `feedSetSchema` as the demo sets before a screen sees it.
import type { createApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { logWarning } from '../log';
import { mapFeed } from './mapFeed';
import { feedSetSchema, type FeedSet } from './schema';
import { FeedLoadError, type CardSource } from './source';

type ApiClient = ReturnType<typeof createApiClient>;

type FeedPath = '/feed/today' | '/feed/next';

/** What an attempt at a card of the served set must name: the set's date and its number. */
type CurrentSet = { feedDate: string; setNumber: number };

/** The date of `date` in the device's own time zone, as `YYYY-MM-DD`. */
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

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

/**
 * The served set, parsed. A set the schema refuses is a FeedLoadError of kind `schema`: the paths
 * of the fields at fault are logged and put in its message, never their content.
 */
function parseSet(data: unknown): FeedSet {
  const result = feedSetSchema.safeParse(mapFeed(data));
  if (result.success) {
    return result.data;
  }
  const paths = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join('; ');
  logWarning('feed_invalid', { paths });
  throw new FeedLoadError(`Card set failed validation at ${paths}`, { kind: 'schema' });
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
 * - `currentSet()` gives the served set's date (the device's date when it arrived, `now`) and
 *   number, for the attempts at its cards; `null` before the first set.
 *
 * Nothing is cancelled when the feed screen goes: the session keeps a set that arrives late.
 */
export function createApiSource(
  api: ApiClient,
  getTopic: () => string | null,
  now: () => Date = () => new Date(),
): CardSource & { currentSet: () => CurrentSet | null } {
  let served: { topic: string; set: CurrentSet } | null = null;

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
      const set = parseSet(data);
      served = { topic, set: { feedDate: localDate(now()), setNumber: set.setNumber } };
      return set;
    },
    currentSet: () => served?.set ?? null,
  };
}
