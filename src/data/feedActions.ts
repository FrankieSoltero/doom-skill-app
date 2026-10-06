// The feed's two card actions through the API (M9 plan H Task 1; spec 5.2): a card's passages for
// "Show me the source" (`GET /cards/{id}/source`) and a card added to the running set
// (`POST /feed/extra`). Each answer is untrusted: its keys are mapped (`mapFeed`) and it is parsed
// with a zod mirror of the generated type, an added card with the feed's own `cardSchema`, before
// a screen sees it. A refused answer logs the paths at fault, never their content.
import { z, type ZodType } from 'zod';

import type { createApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { logWarning } from '../log';
import { mapFeed } from './mapFeed';
import { cardSchema, sourceLinkSchema, type Card } from './schema';

type ApiClient = ReturnType<typeof createApiClient>;

/** An `https` URL; a passage with any other source URL refuses the whole answer. */
const httpsUrl = z.url().refine((u) => u.startsWith('https://'), { message: 'https only' });

/**
 * One passage of the card's node, as `GET /cards/{id}/source` serves it: its text, the sentence
 * before it (`leadIn`, "" when none), `own` for the passage the card was built from, and its
 * source, whose licence is null when none was recorded (the API's `CardSource`).
 */
export const passageSchema = z.object({
  text: z.string().min(1),
  leadIn: z.string(),
  own: z.boolean(),
  source: z.object({ title: z.string(), url: httpsUrl, license: z.string().nullable() }),
});

/** The passages of a card's node, in the server's order, and the node's sources. */
export const cardSourceSchema = z.object({
  passages: z.array(passageSchema),
  sources: z.array(sourceLinkSchema),
});

/**
 * An answer from the API that the app cannot read. HTTP and network failures are the client's
 * `ApiError` instead (src/api/errors.ts).
 */
export class FeedActionError extends Error {
  override readonly name = 'FeedActionError';

  constructor(public readonly kind: 'schema') {
    super(kind);
  }
}

export type CardPassages = z.infer<typeof cardSourceSchema>;

/** `test` adds a practice card of the card's node; `deeper` the next idea's concept card. */
export type ExtraAction = 'test' | 'deeper';

/**
 * What `POST /feed/extra` did: a card added (and the set's count of added cards), nothing to add
 * (a 204), the set full (a 429), or the card not in a set the learner is on (a 404 or 409).
 */
export type ExtraOutcome =
  | { kind: 'added'; card: Card; added: number }
  | { kind: 'nothing' }
  | { kind: 'full' }
  | { kind: 'notInFeed' };

/** `data`, its keys mapped, parsed with `schema`; else a FeedActionError, logged as `event`. */
function parsed<T>(schema: ZodType<T>, data: unknown, event: string): T {
  const result = schema.safeParse(mapFeed(data));
  if (result.success) {
    return result.data;
  }
  const paths = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join('; ');
  logWarning(event, { paths });
  throw new FeedActionError('schema');
}

/**
 * The passages of the card's node and the node's sources (`GET /cards/{card_id}/source`; with
 * `all`, `?all=true`: every passage, for "Go deeper"). Throws a FeedActionError for an answer the
 * schema refuses, the client's ApiError for a failed request.
 */
export async function fetchCardSource(
  api: ApiClient,
  cardId: string,
  all?: boolean,
): Promise<CardPassages> {
  const query = all === true ? { all: true } : {};
  const { data } = await api.GET('/cards/{card_id}/source', {
    params: { path: { card_id: cardId }, query },
  });
  return parsed(cardSourceSchema, data, 'card_source_invalid');
}

/** The added card and the set's count of added cards, as `ExtraOut` serves them. */
const extraSchema = z.object({ card: cardSchema, added: z.number().int().nonnegative() });

/** The outcome an ApiError of these kinds reads as; any other failure is thrown. */
const OUTCOME_BY_KIND: Partial<Record<ApiError['kind'], ExtraOutcome>> = {
  rateLimited: { kind: 'full' },
  notFound: { kind: 'notInFeed' },
  conflict: { kind: 'notInFeed' },
};

/**
 * Adds a card to the set the learner is on (`POST /feed/extra`), naming the set by the date and
 * number the API source served it with. Sent once: the client never retries a POST. A failure
 * other than a 404, 409 or 429 throws the client's ApiError; an added card the schema refuses
 * throws a FeedActionError.
 */
export async function addExtra(
  api: ApiClient,
  cardId: string,
  action: ExtraAction,
  set: { feedDate: string; setNumber: number },
): Promise<ExtraOutcome> {
  const body = {
    card_id: cardId,
    action,
    feed_date: set.feedDate,
    set_number: set.setNumber,
  };
  try {
    const { data } = await api.POST('/feed/extra', { body });
    if (data === undefined) {
      return { kind: 'nothing' };
    }
    return { kind: 'added', ...parsed(extraSchema, data, 'extra_invalid') };
  } catch (error) {
    const outcome = error instanceof ApiError ? OUTCOME_BY_KIND[error.kind] : undefined;
    if (outcome === undefined) throw error;
    return outcome;
  }
}
