/**
 * Choosing a level-2 project (`POST /topics/{slug}/choose`; M11 plan Task 21, decision M21), from
 * the unlock card's choices or the topic screen's levels row. `choose(slug)` resolves to what the
 * choice did (`ChoiceOutcome`: the next level's state and the chosen variant's slug), then marks
 * stale every cached topic and the learner's enrollments, so the levels row reads them again.
 *
 * A refused or failed choice rejects, and `error` says which line to show:
 * - `chosenOther`: a 409, the learner chose another project of this level (`Variant chosen`). The
 *   API client never reads an error's body (src/api/errors.ts), so the hook cannot tell this 409
 *   from `Not choosable` or `Level locked`; the app offers a choice only for a variant of a root the
 *   learner completed (the unlock's choices, a `choosable` chip), where `Variant chosen` is the 409
 *   left.
 * - `failed`: anything else (a 404, no network, the server down, a reply the schema refuses).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '../api/errors';
import { requireApi } from '../api/query';
import { chooseLevel, type ChoiceOutcome } from '../data/levels';

/** The learner's enrollments' key in the server-state cache (`GET /me/enrollments`). */
export const ENROLLMENTS_KEY = ['enrollments'] as const;

/** The key prefix of every topic's detail in the cache (`GET /topics/{slug}`, src/topics/useTopic.ts). */
const TOPIC_KEY = ['topic'] as const;

/** The status of the 409 a choice of a second variant gets. */
const CONFLICT = 409;

/** The line a failed choice shows (see the module comment). */
type ChooseError = 'chosenOther' | 'failed';

/** What `error` reads as, or `null` for none. */
function chooseError(error: Error | null): ChooseError | null {
  if (error === null) return null;
  return error instanceof ApiError && error.status === CONFLICT ? 'chosenOther' : 'failed';
}

/** Chooses a level-2 project (see the module comment). */
export function useChoose(): {
  choose: (slug: string) => Promise<ChoiceOutcome>;
  pending: boolean;
  error: ChooseError | null;
} {
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: (slug: string) => chooseLevel(requireApi(), slug),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: TOPIC_KEY }),
        cache.invalidateQueries({ queryKey: ENROLLMENTS_KEY }),
      ]);
    },
  });
  return {
    choose: mutation.mutateAsync,
    pending: mutation.isPending,
    error: chooseError(mutation.error),
  };
}
