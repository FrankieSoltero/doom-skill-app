// A CardSource over the bundled demo fixtures. Only `src/data/` may import this file or the
// fixtures (rule SS-6); the rest of the app goes through `cardSource` in `index.ts`.
import type { z } from 'zod';

import extra from './__fixtures__/cards.extra.fixture.json';
import fixture from './__fixtures__/cards.fixture.json';
import { feedSetSchema, type FeedSet } from './schema';
import { FeedLoadError, type CardSource } from './source';

/** The two parts of a demo set that come from a fixture. The source adds the rest. */
type DemoSet = { cards: unknown; summary: unknown };

/**
 * The demo sets in serving order, each only its cards and summary: set 1 from the design fixture,
 * then sets 2 to 4 from the extra fixture. Picking the two keys means no other key in the JSON
 * reaches a served set: the topic is always the design fixture's and the set number the source's
 * own count. See `__fixtures__/README.md`.
 */
const DEMO_SETS: readonly DemoSet[] = [fixture, ...extra.sets].map(
  ({ cards, summary }): DemoSet => ({ cards, summary }),
);

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
      kind: 'schema',
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * A new source over the demo sets, with its own position. It serves sets 1, 2, 3 and 4, then set
 * 1's cards again, without end, and never resolves to `null`. The set number counts up from 1
 * without limit, so the fifth call serves set 1's cards as set 5. Each set is validated as it is
 * served, and parsing builds new objects, so no two calls share a reference. The position moves
 * on only when a set parses, so a retry after a `FeedLoadError` asks for the same set again.
 */
export function createFixtureSource(): CardSource {
  let nextSetNumber = 1;
  return {
    getNextSet() {
      // Inside `then`, so a validation throw becomes a rejected promise, and calls made together
      // read and move the position one after another.
      return Promise.resolve().then(() => {
        const setNumber = nextSetNumber;
        const demo = DEMO_SETS[(setNumber - 1) % DEMO_SETS.length];
        const set = parseFeedSet({ ...demo, topic: fixture.topic, setNumber });
        nextSetNumber = setNumber + 1;
        return set;
      });
    },
  };
}
