// The one way the app gets card content (rule SS-6). Screens depend on this interface; which
// implementation serves it is chosen once, in `index.ts`.
import type { ApiError } from '../api/errors';
import type { FeedSet } from './schema';

export interface CardSource {
  /** The next set of cards, or `null` when there is nothing more to serve. */
  getNextSet(): Promise<FeedSet | null>;
}

/**
 * Why a set could not be loaded: the kind of the API's error (`offline`, `timeout`,
 * `unauthorized`, ...); `noTopic` when the learner has no active topic, so nothing was asked;
 * `schema` for a set that did not match the card schema; `unknown` for any other failure.
 */
type FeedLoadKind = ApiError['kind'] | 'noTopic' | 'schema' | 'unknown';

/** Card content could not be loaded or did not match the schema. */
export class FeedLoadError extends Error {
  override readonly name = 'FeedLoadError';
  readonly kind: FeedLoadKind;

  constructor(message: string, options: { kind: FeedLoadKind; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.kind = options.kind;
  }
}
