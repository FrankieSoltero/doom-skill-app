/**
 * The Explore tab's one result list (Explore plan Task 4, E2): the preloaded slice matched as the
 * learner types, merged with the server's suggestions, through the server-state cache
 * (src/api/query.ts). Types come from the generated schema, as for the other topic hooks.
 *
 * - On mount it loads `GET /topics/suggest/top` (every open topic and the top catalog rows),
 *   cached for `TOP_STALE_MS` (fresh that long, and kept that long after the screen leaves).
 * - For a non-empty text (cleaned as the search cleans it) it matches the slice at once: a label
 *   or title that starts with the text, then one where the text starts at a word's start (it may
 *   run on across words: "market d" matches "Stock market data"); case-insensitive, never
 *   "contains". `GET /topics/suggest` asks `SUGGEST_DEBOUNCE_MS` after the last change, and the
 *   request for an earlier text is cancelled.
 * - The rows, without repeats by key: the matching open topics (prefix first, then by title),
 *   then the server's rows in its order, then the slice's other matches (prefix first, then by
 *   rank). Until the server answers the text, `loading`, with the last answer's rows that still
 *   match the text (they may narrow, never contradict); then `ready`; a failed suggestion is
 *   `error` with the slice's matches. A slice that fails or waits leaves the server's rows alone.
 * - A blank text is `idle` with no rows and asks no suggestions.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { cleanQuery, useDebounced, type TopicSummary } from './useTopics';

type Suggestion = components['schemas']['Suggestion'];
type TopSuggestions = components['schemas']['TopSuggestions'];
type Group = components['schemas']['Group'];

/** How long the preloaded slice stays fresh: one hour. */
export const TOP_STALE_MS = 3_600_000;

/** How long the server's suggestions wait after the last change before they ask. */
export const SUGGEST_DEBOUNCE_MS = 150;

/** One row of the list: an open topic (`source 'topic'`) or a catalog row. */
export type ExploreRow = {
  key: string;
  label: string;
  group: Group;
  kind: string | null;
  builtSlug: string | null;
  source: 'topic' | 'catalog';
};

type ExploreResults = { rows: ExploreRow[]; status: 'idle' | 'loading' | 'ready' | 'error' };

const IDLE: ExploreResults = { status: 'idle', rows: [] };

/** Under `topics`, so a created topic (which invalidates `topics`) reloads the slice. */
const TOP_KEY = ['topics', 'suggest', 'top'] as const;

/** A word: a run of letters, digits, `+` and `#` (so "C++" and "C#" stay one word). */
const WORD = /[\p{L}\p{N}+#]+/gu;

/**
 * How `label` matches the lower-cased `text`: 0 for a prefix, 1 when the text starts at a later
 * word's start (running on across words if it goes on), `null` for no match.
 */
function matchTier(label: string, text: string): 0 | 1 | null {
  const lower = label.toLowerCase();
  if (lower.startsWith(text)) return 0;
  const starts = Array.from(lower.matchAll(WORD), (word) => word.index);
  return starts.some((start) => lower.startsWith(text, start)) ? 1 : null;
}

/** The items whose label matches `text`, prefix matches first, each tier in `order`. */
function matching<T>(
  items: T[],
  text: string,
  label: (item: T) => string,
  order: (a: T, b: T) => number,
): T[] {
  const tiered = items.flatMap((item) => {
    const tier = matchTier(label(item), text);
    return tier === null ? [] : [{ item, tier }];
  });
  tiered.sort((a, b) => a.tier - b.tier || order(a.item, b.item));
  return tiered.map(({ item }) => item);
}

function fromTopic(topic: TopicSummary): ExploreRow {
  // `TopicSummary` carries no group: an open topic reads as prose until the API serves one.
  return {
    key: `topic:${topic.slug}`,
    label: topic.title,
    group: 'prose',
    kind: null,
    builtSlug: topic.slug,
    source: 'topic',
  };
}

function fromSuggestion(row: Suggestion): ExploreRow {
  return {
    key: row.key,
    label: row.label,
    group: row.group,
    kind: row.kind,
    builtSlug: row.built_slug,
    source: 'catalog',
  };
}

/** The rows in order, the first of each key kept. */
function merged(...lists: ExploreRow[][]): ExploreRow[] {
  const seen = new Set<string>();
  return lists.flat().filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

async function loadTop(signal: AbortSignal): Promise<TopSuggestions> {
  const { data } = await requireApi().GET('/topics/suggest/top', { signal });
  return data ?? { topics: [], rows: [] };
}

async function suggestTopics(q: string, signal: AbortSignal): Promise<Suggestion[]> {
  const { data } = await requireApi().GET('/topics/suggest', { params: { query: { q } }, signal });
  return data?.suggestions ?? [];
}

/** The slice's matches for the lower-cased `text`: open topics, then catalog rows. */
function sliceMatches(top: TopSuggestions | undefined, text: string) {
  if (top === undefined) return { open: [], rows: [] };
  const byTitle = (a: TopicSummary, b: TopicSummary) => a.title.localeCompare(b.title);
  const byRank = (a: Suggestion, b: Suggestion) => b.rank - a.rank;
  const open = matching(top.topics, text, (t) => t.title, byTitle);
  const rows = matching(top.rows, text, (r) => r.label, byRank);
  return { open: open.map(fromTopic), rows: rows.map(fromSuggestion) };
}

/** The Explore rows for `text` (see the module comment). */
export function useExploreResults(text: string): ExploreResults {
  const wanted = cleanQuery(text);
  const settled = useDebounced(wanted, SUGGEST_DEBOUNCE_MS);
  const top = useQuery({
    queryKey: TOP_KEY,
    queryFn: ({ signal }) => loadTop(signal),
    staleTime: TOP_STALE_MS,
    gcTime: TOP_STALE_MS,
  });
  const server = useQuery({
    // The text sits in an object: a bare `'top'` would share the slice's key.
    queryKey: ['topics', 'suggest', { q: settled }],
    queryFn: ({ signal }) => suggestTopics(settled, signal),
    enabled: settled !== '',
    placeholderData: keepPreviousData,
  });

  if (wanted === '') return IDLE;
  const lower = wanted.toLowerCase();
  const slice = sliceMatches(top.data, lower);
  const current = settled === wanted;
  const landed = current && server.isSuccess && !server.isPlaceholderData;
  // An earlier text's answer: only its rows that still match the text.
  const previous = (server.data ?? []).filter((row) => matchTier(row.label, lower) !== null);
  const serverRows = (landed ? server.data : previous).map(fromSuggestion);
  const rows = merged(slice.open, serverRows, slice.rows);
  if (current && server.isError) return { status: 'error', rows };
  return { status: landed ? 'ready' : 'loading', rows };
}
