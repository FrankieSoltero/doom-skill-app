// A CardSource over the bundled demo fixtures. Only `src/data/` may import this file or the
// fixtures (rule SS-6); the rest of the app goes through `cardSource` in `index.ts`.
import type { z } from 'zod';

import extra from './__fixtures__/cards.extra.fixture.json';
import fixture from './__fixtures__/cards.fixture.json';
import { feedSetSchema, type FeedSet } from './schema';
import { FeedLoadError, type CardSource } from './source';

/**
 * The demo sets in serving order, each its cards and summary: set 1 from the design fixture, then
 * sets 2 to 4 from the extra fixture. All share the design fixture's topic, and none carries a set
 * number: the source adds both. See `__fixtures__/README.md`.
 */
const DEMO_SETS: readonly { cards: unknown; summary: unknown }[] = [
  { cards: fixture.cards, summary: fixture.summary },
  ...extra.sets,
];

/** One entry per issue, each led by the dotted path of the field at fault. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`)
    .join('; ');
}

/** Validates a raw set against the schema, turning a mismatch into a FeedLoadError. */
function parseFeedSet(raw: unknown): FeedSet {
  const result = feedSetSchema.safeParse(raw);
  if (!result.success) {
    throw new FeedLoadError(`Card set failed validation: ${describeIssues(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * A new source over the demo sets, with its own position. It serves sets 1, 2, 3 and 4, then set
 * 1's cards again, without end, and never resolves to `null`. The set number counts up from 1
 * without limit, so the fifth call serves set 1's cards as set 5. Each set is validated as it is
 * served, and parsing builds new objects, so no two calls share a reference.
 */
export function createFixtureSource(): CardSource {
  let nextSetNumber = 1;
  return {
    getNextSet() {
      const setNumber = nextSetNumber;
      nextSetNumber += 1;
      const demo = DEMO_SETS[(setNumber - 1) % DEMO_SETS.length];
      // Parsing inside `then` turns a validation throw into a rejected promise.
      return Promise.resolve().then(() =>
        parseFeedSet({ topic: fixture.topic, setNumber, ...demo }),
      );
    },
  };
}
