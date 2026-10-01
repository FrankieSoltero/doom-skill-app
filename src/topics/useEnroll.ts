/**
 * Enrolling in a topic (`POST /topics/{slug}/enroll`): for 14 days, at the profile's daily minutes
 * (`GET /me`, from the cache while its copy is fresh; 10 when it cannot be read). `enroll()`
 * resolves to what opens next:
 * - `placement`: a new enrollment (a 201) with the API's placement quiz (src/data `placement`,
 *   null with the demo sets). The active topic stays: the placement screen makes the topic active
 *   when it opens the feed, so the Today feed does not ask for a set before the placement.
 * - `feed`: otherwise (a 200, enrolled already; or no placement): the topic becomes the active
 *   topic, which the Today feed then starts (src/feed/useActiveTopic.ts).
 * A refused enrollment (a 409 while the topic is not ready) rejects with its `ApiError`, which is
 * also the hook's `error`; the active topic stays.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { asApiError, MUTATION_STATUS, requireApi } from '../api/query';
import { placement } from '../data';
import { useActiveTopic } from '../feed/useActiveTopic';
import { fetchMe, ME_KEY } from '../profile/me';

/** The plan's length, in days. */
const HORIZON_DAYS = 14;

/** The daily minutes when the profile cannot be read: the API's own default. */
const DEFAULT_DAILY_MINUTES = 10;

/** The HTTP status of a new enrollment. */
const CREATED = 201;

/** What opens after enrolling (see the module comment). */
type EnrollNext = 'placement' | 'feed';

/** Enrolls in `slug` (see the module comment). */
export function useEnroll(slug: string) {
  const cache = useQueryClient();
  const { setActive } = useActiveTopic();
  const mutation = useMutation({
    mutationFn: async (): Promise<EnrollNext> => {
      const minutes = await cache
        .query({ queryKey: ME_KEY, queryFn: ({ signal }) => fetchMe(signal) })
        .then((profile) => profile.daily_minutes)
        .catch(() => DEFAULT_DAILY_MINUTES);
      const { response } = await requireApi().POST('/topics/{slug}/enroll', {
        params: { path: { slug } },
        body: { horizon_days: HORIZON_DAYS, daily_minutes: minutes },
      });
      if (response.status === CREATED && placement !== null) return 'placement';
      await setActive(slug);
      return 'feed';
    },
  });
  const error = asApiError(mutation.error);
  return {
    enroll: () => mutation.mutateAsync(),
    status: MUTATION_STATUS[mutation.status],
    ...(error === undefined ? {} : { error }),
  };
}
