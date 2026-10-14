/**
 * The catalog suggestions (`GET /topics/suggest?q=`) for what the learner types on the Explore
 * tab, through the server-state cache (src/api/query.ts). Types come from the generated schema.
 *
 * `useSuggest(query)` cleans the query as the search does (trimmed, cut to 80 characters) and asks
 * 200 ms after the last change. A blank query is `idle` and asks nothing. When the query changes,
 * the request for the previous one is cancelled (its abort signal reaches the network). While it
 * waits or asks it is `loading`, and keeps the last answer's suggestions so the list does not
 * flicker. A failed request is `error` with no suggestions: the screen shows nothing for it.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { cleanQuery, useDebounced } from './useTopics';

export type Suggestion = components['schemas']['Suggestion'];

/** How long the suggestions wait after the last change before they ask. */
const DEBOUNCE_MS = 200;

type SuggestState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  suggestions: Suggestion[];
};

async function suggestTopics(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const { data } = await requireApi().GET('/topics/suggest', { params: { query: { q } }, signal });
  return data?.suggestions ?? [];
}

/** The catalog topics for `query`, best first (see the module comment). */
export function useSuggest(query: string): SuggestState {
  const wanted = cleanQuery(query);
  const settled = useDebounced(wanted, DEBOUNCE_MS);
  const result = useQuery({
    // Under `topics`, so a created topic (which invalidates `topics`) asks again for its mark.
    queryKey: ['topics', 'suggest', settled],
    queryFn: ({ signal }) => suggestTopics(settled, signal),
    enabled: settled !== '',
    placeholderData: keepPreviousData,
  });

  if (wanted === '') return { status: 'idle', suggestions: [] };
  if (result.isError) return { status: 'error', suggestions: [] };
  const suggestions = result.data ?? [];
  const waiting = settled !== wanted || result.isPending || result.isPlaceholderData;
  return { status: waiting ? 'loading' : 'ready', suggestions };
}
