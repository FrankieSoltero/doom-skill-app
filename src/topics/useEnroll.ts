/**
 * Enrolling in a topic (`POST /topics/{slug}/enroll`): for 14 days, at the profile's daily minutes
 * (`GET /me`, from the cache while its copy is fresh; 10 when it cannot be read). On a 201
 * (enrolled) or a 200 (enrolled already) the topic becomes the active topic, which the Today feed
 * then starts (src/feed/useActiveTopic.ts). A refused enrollment (a 409 while the topic is not
 * ready) rejects with its `ApiError`, which is also the hook's `error`; the active topic stays.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { asApiError, MUTATION_STATUS, requireApi } from '../api/query';
import { useActiveTopic } from '../feed/useActiveTopic';
import { fetchMe, ME_KEY } from '../profile/me';

/** The plan's length, in days. */
const HORIZON_DAYS = 14;

/** The daily minutes when the profile cannot be read: the API's own default. */
const DEFAULT_DAILY_MINUTES = 10;

/** Enrolls in `slug` (see the module comment). */
export function useEnroll(slug: string) {
  const cache = useQueryClient();
  const { setActive } = useActiveTopic();
  const mutation = useMutation({
    mutationFn: async () => {
      const minutes = await cache
        .query({ queryKey: ME_KEY, queryFn: ({ signal }) => fetchMe(signal) })
        .then((profile) => profile.daily_minutes)
        .catch(() => DEFAULT_DAILY_MINUTES);
      await requireApi().POST('/topics/{slug}/enroll', {
        params: { path: { slug } },
        body: { horizon_days: HORIZON_DAYS, daily_minutes: minutes },
      });
      await setActive(slug);
    },
  });
  const error = asApiError(mutation.error);
  return {
    enroll: () => mutation.mutateAsync(),
    status: MUTATION_STATUS[mutation.status],
    ...(error === undefined ? {} : { error }),
  };
}
