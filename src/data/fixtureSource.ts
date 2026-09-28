// A CardSource over the bundled demo fixture. Only `src/data/` may import this file or the
// fixture (rule SS-6); the rest of the app goes through `cardSource` in `index.ts`.
import type { z } from 'zod';

import fixture from './__fixtures__/cards.fixture.json';
import { feedSetSchema, type FeedSet } from './schema';
import { FeedLoadError, type CardSource } from './source';

// The fixture holds one set. It carries no set number, so the source assigns it.
const FIXTURE_SET_COUNT = 1;

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

/** A new source over the fixture, with its own position: each call starts at set 1. */
export function createFixtureSource(): CardSource {
  let nextSetNumber = 1;
  return {
    getNextSet() {
      if (nextSetNumber > FIXTURE_SET_COUNT) {
        return Promise.resolve(null);
      }
      const setNumber = nextSetNumber;
      nextSetNumber += 1;
      // Parsing inside `then` turns a validation throw into a rejected promise.
      return Promise.resolve().then(() => parseFeedSet({ ...fixture, setNumber }));
    },
  };
}
