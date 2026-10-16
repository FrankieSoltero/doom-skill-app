/**
 * Interim (Explore plan Task 4): the Explore tab's old suggestion interface over
 * `useExploreResults`, so `app/(tabs)/explore.tsx` compiles until Task 5 moves it to the new hook
 * and deletes this file. It keeps the catalog rows only (the screen lists open topics through its
 * search) in their old shape; `rank` is no longer read, so it is 0.
 */
import type { components } from '../api/schema';
import { useExploreResults } from './useExploreResults';

export type Suggestion = components['schemas']['Suggestion'];

/** The catalog rows for `query`, as `useExploreResults` gives them. */
export function useSuggest(query: string) {
  const { status, rows } = useExploreResults(query);
  const suggestions: Suggestion[] = rows.flatMap((row) =>
    row.source === 'catalog'
      ? [
          {
            key: row.key,
            label: row.label,
            group: row.group,
            kind: row.kind ?? '',
            rank: 0,
            built_slug: row.builtSlug,
          },
        ]
      : [],
  );
  return { status, suggestions };
}
