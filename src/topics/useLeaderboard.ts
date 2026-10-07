/**
 * A topic's leaderboard (`GET /topics/{slug}/leaderboard`) through the server-state cache: the top
 * 50 opted-in learners with their rank and points, and the caller's own rank and points (`me`,
 * `null` when the caller has no points on the topic).
 */
import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../api/errors';
import { asApiError, requireApi } from '../api/query';
import type { components } from '../api/schema';

export type Leaderboard = components['schemas']['Leaderboard'];

type LeaderboardState = {
  status: 'loading' | 'ready' | 'error';
  board?: Leaderboard;
  error?: ApiError;
  /** Asks again, after an error. */
  retry: () => void;
};

async function fetchLeaderboard(slug: string, signal: AbortSignal): Promise<Leaderboard> {
  const { data } = await requireApi().GET('/topics/{slug}/leaderboard', {
    params: { path: { slug } },
    signal,
  });
  if (data === undefined) throw new Error('The leaderboard request gave no body');
  return data;
}

/** The leaderboard of the topic `slug` (see the module comment). */
export function useLeaderboard(slug: string): LeaderboardState {
  const result = useQuery({
    queryKey: ['leaderboard', slug],
    queryFn: ({ signal }) => fetchLeaderboard(slug, signal),
  });
  const retry = () => {
    void result.refetch();
  };
  if (result.isSuccess) return { status: 'ready', board: result.data, retry };
  const error = asApiError(result.error);
  if (error !== undefined) return { status: 'error', error, retry };
  return { status: 'loading', retry };
}
