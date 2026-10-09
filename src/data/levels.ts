// The choice of a level-2 project through the API (M11 plan Task 21; decision M21):
// `POST /topics/{slug}/choose` on the chosen variant's slug. The reply is untrusted: it is parsed
// with a zod mirror of the generated `ChoiceOutcome` (`parsed`, as src/data/qa.ts does) before a
// screen sees it. A refused choice (a 404, or a 409 `Not choosable`, `Level locked` or `Variant
// chosen`) rejects with the client's ApiError, which holds the status and never the body.
import { z } from 'zod';

import type { createApiClient } from '../api/client';
import type { components } from '../api/schema';
import { parsed } from './feedActions';

type ApiClient = ReturnType<typeof createApiClient>;

/** What choosing a level-2 project did: the next level's state and the chosen variant's slug. */
export type ChoiceOutcome = components['schemas']['ChoiceOutcome'];

/** The values of the generated `LevelNext`. */
const LEVEL_NEXT = ['enrolled', 'building', 'waiting', 'deepest', 'failed', 'choose'] as const;

const choiceOutcomeSchema: z.ZodType<ChoiceOutcome> = z.object({
  next: z.enum(LEVEL_NEXT),
  slug: z.string(),
});

/**
 * Chooses the level-2 project `slug` (`POST /topics/{slug}/choose`), or reads what choosing it did
 * (the same variant again answers its current state). Sent once: the client never retries a POST.
 * Rejects with the client's ApiError on a failure, a FeedActionError for a reply the schema
 * refuses.
 */
export async function chooseLevel(api: ApiClient, slug: string): Promise<ChoiceOutcome> {
  const { data } = await api.POST('/topics/{slug}/choose', { params: { path: { slug } } });
  return parsed(choiceOutcomeSchema, data, 'choice_invalid');
}
