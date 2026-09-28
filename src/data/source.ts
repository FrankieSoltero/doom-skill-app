// The one way the app gets card content (rule SS-6). Screens depend on this interface; which
// implementation serves it is chosen once, in `index.ts`.
import type { FeedSet } from './schema';

export interface CardSource {
  /** The next set of cards, or `null` when there is nothing more to serve. */
  getNextSet(): Promise<FeedSet | null>;
}

/** Card content could not be loaded or did not match the schema. */
export class FeedLoadError extends Error {
  override readonly name = 'FeedLoadError';
}
