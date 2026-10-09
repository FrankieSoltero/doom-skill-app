/**
 * The learner's enrollments (`GET /me/enrollments`) through the server-state cache, oldest first as
 * the server sends them: each topic's slug, title, status, level and when it was last studied. It
 * is read again each time a screen that uses it is drawn (`staleTime` 0), and `useChoose` marks it
 * stale after a choice (`ENROLLMENTS_KEY`).
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { ENROLLMENTS_KEY } from './useChoose';

export type Enrollment = components['schemas']['Enrollment'];

async function fetchEnrollments(signal: AbortSignal): Promise<Enrollment[]> {
  const { data } = await requireApi().GET('/me/enrollments', { signal });
  if (data === undefined) throw new Error('The enrollments request gave no body');
  return data.enrollments;
}

/** The learner's enrollments (see the module comment). */
export function useEnrollments(): UseQueryResult<Enrollment[]> {
  return useQuery({
    queryKey: ENROLLMENTS_KEY,
    queryFn: ({ signal }) => fetchEnrollments(signal),
    staleTime: 0,
  });
}

/** Each enrollment's status, by topic slug. */
export function enrollmentStatuses(list: Enrollment[]): Map<string, Enrollment['status']> {
  return new Map(list.map((e) => [e.topic_slug, e.status]));
}
