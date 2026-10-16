/**
 * A catalog subject's branches (catalog learnable-topics plan, L6): `GET /catalog/{key}/branches`
 * through the server-state cache (src/api/query.ts), as Explore rows (`fromSuggestion`), in the
 * server's order (disciplines first). The Explore tab's branches sheet reads it.
 *
 * - Without a key (`null`: no sheet open) it is `idle`, with no rows, and asks nothing.
 * - The answer is cached for `BRANCHES_STALE_MS`: fresh that long, and kept that long after the
 *   sheet closes, so reopening a subject within the hour asks nothing.
 * - Until the answer lands it is `loading`; a failed request is `error`. Both have no rows.
 */
import { useQuery } from '@tanstack/react-query';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { fromSuggestion, type ExploreRow } from './useExploreResults';

type Suggestion = components['schemas']['Suggestion'];

/** How long a subject's branches stay fresh, and stay cached once unused: one hour. */
export const BRANCHES_STALE_MS = 3_600_000;

type BranchesState = { rows: ExploreRow[]; status: 'idle' | 'loading' | 'ready' | 'error' };

async function fetchBranches(key: string, signal: AbortSignal): Promise<Suggestion[]> {
  const { data } = await requireApi().GET('/catalog/{key}/branches', {
    params: { path: { key } },
    signal,
  });
  if (data === undefined) throw new Error('The branches request gave no body');
  return data;
}

/** The branches of the catalog row `key`; `null` asks nothing (see the module comment). */
export function useBranches(key: string | null): BranchesState {
  const result = useQuery({
    queryKey: ['catalog', 'branches', key],
    queryFn: ({ signal }) => fetchBranches(key ?? '', signal),
    enabled: key !== null,
    staleTime: BRANCHES_STALE_MS,
    gcTime: BRANCHES_STALE_MS,
  });
  if (key === null) return { status: 'idle', rows: [] };
  if (result.isSuccess) return { status: 'ready', rows: result.data.map(fromSuggestion) };
  if (result.isError) return { status: 'error', rows: [] };
  return { status: 'loading', rows: [] };
}
