/**
 * The Explore tab's one result list (Explore plan Task 4, E2; paged in the curriculum catalog
 * plan, C7): the preloaded slice matched as the learner types, merged with the server's
 * suggestions, through the server-state cache (src/api/query.ts). Types come from the generated
 * schema, as for the other topic hooks.
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
 * - A blank text is `idle`, asks no suggestions, and lists the slice: its open topics, then its
 *   catalog rows.
 * - Pages: those rows are page 0. When the list's last answer says `has_more`, `loadMore()` asks
 *   for the next page at `offset` = the catalog rows the list has loaded (the open topics never
 *   count) and appends it; a call while the list loads is ignored, and `loadingMore` holds then
 *   (the next page on its way, or the list's own answer refetching). A new text starts every list
 *   again at its first page.
 */
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { cleanQuery, useDebounced, type TopicSummary } from './useTopics';

type Suggestion = components['schemas']['Suggestion'];
type SuggestionList = components['schemas']['SuggestionList'];
type TopSuggestions = components['schemas']['TopSuggestions'];
type Group = components['schemas']['Group'];

/** How long the preloaded slice stays fresh: one hour. */
export const TOP_STALE_MS = 3_600_000;

/** How long the server's suggestions wait after the last change before they ask. */
export const SUGGEST_DEBOUNCE_MS = 150;

/**
 * One row of the list: an open topic (`source 'topic'`) or a catalog row. `branches` is the
 * number of the catalog row's branches (`GET /catalog/{key}/branches`, src/topics/useBranches.ts);
 * an open topic has none of its own. When the Explore list shows an open topic in place of its
 * catalog row (app/(tabs)/explore.tsx), it takes that row's `branches`, and `branchesKey` names
 * the catalog row they are read from. `tier`, `depth` and `parent` place a catalog row in the
 * curriculum (its tier, its level from area to course, the row above it).
 */
export type ExploreRow = {
  key: string;
  label: string;
  group: Group;
  kind: string | null;
  builtSlug: string | null;
  source: 'topic' | 'catalog';
  branches: number;
  branchesKey?: string;
  tier: number;
  depth: number;
  parent: string | null;
};

type ExploreResults = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** The rows by page, each key on its first row only: page 0, then each page `loadMore` added. */
  pages: ExploreRow[][];
  /** Every page's rows, in order. */
  rows: ExploreRow[];
  /** Whether the list's last answer says the server has a next page. */
  hasMore: boolean;
  /** Whether the next page is on its way or the list's own answer refetches (a tap would wait). */
  loadingMore: boolean;
  /** Asks for the next page and appends it; ignored while the list loads or has no more. */
  loadMore: () => void;
};

/** The suggestion queries: under `topics`, so a created topic (which invalidates it) reloads them. */
const SUGGEST_KEY = ['topics', 'suggest'] as const;
const TOP_KEY = [...SUGGEST_KEY, 'top'] as const;

/**
 * Where an open topic sorts among catalog rows: the catalog's defaults for a row with no place in
 * the curriculum (tier 2, depth 4). The list puts open topics first whatever their place.
 */
const OPEN_TOPIC_PLACE = { tier: 2, depth: 4, parent: null };

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
    branches: 0,
    ...OPEN_TOPIC_PLACE,
  };
}

/** A catalog row from the server (a suggestion, a slice row or a branch) as a list row. */
export function fromSuggestion(row: Suggestion): ExploreRow {
  return {
    key: row.key,
    label: row.label,
    group: row.group,
    kind: row.kind,
    builtSlug: row.built_slug,
    source: 'catalog',
    branches: row.branches,
    tier: row.tier,
    depth: row.depth,
    parent: row.parent,
  };
}

/**
 * The most catalog rows page 0 holds, the server's page size: the slice's matches past the
 * server's own rows wait for the pages that hold them. Every open topic shows besides them.
 */
export const EXPLORE_MAX_ROWS = 20;

/** The pages with each key kept on its first row only. */
function distinct(pages: ExploreRow[][]): ExploreRow[][] {
  const seen = new Set<string>();
  return pages.map((page) =>
    page.filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    }),
  );
}

async function loadTop(offset: number, signal: AbortSignal): Promise<TopSuggestions> {
  // Page 0 sends no offset, as the request did before paging.
  const query = offset === 0 ? {} : { offset };
  const { data } = await requireApi().GET('/topics/suggest/top', { params: { query }, signal });
  return data ?? { topics: [], rows: [], has_more: false };
}

async function suggestTopics(q: string, offset: number, signal: AbortSignal) {
  const query = offset === 0 ? { q } : { q, offset };
  const { data } = await requireApi().GET('/topics/suggest', { params: { query }, signal });
  return data ?? { suggestions: [], has_more: false };
}

/**
 * The next page's `offset` (the catalog rows on `pages`, which `count` reads), or none when the
 * last page says the server has no more.
 */
function nextOffset<P extends { has_more: boolean }>(count: (page: P) => number) {
  return (last: P, pages: P[]) =>
    last.has_more ? pages.reduce((sum, page) => sum + count(page), 0) : undefined;
}

/**
 * Cuts every suggestion list in the cache to its first page, keeping each one's age (a cut is
 * not a fresh answer): what a new text does to the pages another text loaded.
 */
function firstPagesOnly(cache: QueryClient): void {
  const lists = cache.getQueriesData<InfiniteData<unknown>>({ queryKey: SUGGEST_KEY });
  for (const [key, data] of lists) {
    const updatedAt = cache.getQueryState(key)?.dataUpdatedAt;
    if (data === undefined || updatedAt === undefined || data.pages.length < 2) continue;
    const first = { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) };
    cache.setQueryData(key, first, { updatedAt });
  }
}

/** The slice's matches for the lower-cased `text`: open topics, then catalog rows. */
function sliceMatches(top: TopSuggestions[], text: string) {
  const byTitle = (a: TopicSummary, b: TopicSummary) => a.title.localeCompare(b.title);
  const byRank = (a: Suggestion, b: Suggestion) => b.rank - a.rank;
  const topics = top.flatMap((page) => page.topics);
  const catalog = top.flatMap((page) => page.rows);
  const open = matching(topics, text, (t) => t.title, byTitle);
  const rows = matching(catalog, text, (r) => r.label, byRank);
  return { open: open.map(fromTopic), rows: rows.map(fromSuggestion) };
}

/** What a list can do about its next page. */
type Pager = {
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<unknown>;
};

/** Page 0 without repeats, cut to `EXPLORE_MAX_ROWS` catalog rows. */
function firstPage(rows: ExploreRow[]): ExploreRow[] {
  const [unique = []] = distinct([rows]);
  const open = unique.filter((row) => row.source === 'topic');
  const catalog = unique.filter((row) => row.source === 'catalog').slice(0, EXPLORE_MAX_ROWS);
  return [...open, ...catalog];
}

/** The results for `pages`, paged by `list` (`hasMore` only when `own`: its answer is the text's). */
function paged(status: ExploreResults['status'], pages: ExploreRow[][], list: Pager, own: boolean) {
  const [first = [], ...later] = pages;
  const kept = distinct([firstPage(first), ...later]);
  return {
    status,
    pages: kept,
    rows: kept.flat(),
    hasMore: own && list.hasNextPage,
    // Whenever a tap would do nothing: the next page on its way, or the list's answer refetching.
    loadingMore: list.isFetchingNextPage || (own && list.isFetching),
    loadMore: () => {
      // `cancelRefetch: false`: a second call before the first page lands does nothing either.
      if (!own || !list.hasNextPage || list.isFetching) return;
      void list.fetchNextPage({ cancelRefetch: false });
    },
  };
}

/** The Explore rows for `text` (see the module comment). */
export function useExploreResults(text: string): ExploreResults {
  const wanted = cleanQuery(text);
  const settled = useDebounced(wanted, SUGGEST_DEBOUNCE_MS);
  const cache = useQueryClient();
  useEffect(() => {
    firstPagesOnly(cache);
  }, [cache, wanted]);
  const top = useInfiniteQuery({
    queryKey: TOP_KEY,
    queryFn: ({ signal, pageParam }) => loadTop(pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: nextOffset((page: TopSuggestions) => page.rows.length),
    staleTime: TOP_STALE_MS,
    gcTime: TOP_STALE_MS,
  });
  const server = useInfiniteQuery({
    // The text sits in an object: a bare `'top'` would share the slice's key.
    queryKey: [...SUGGEST_KEY, { q: settled }],
    queryFn: ({ signal, pageParam }) => suggestTopics(settled, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: nextOffset((page: SuggestionList) => page.suggestions.length),
    enabled: settled !== '',
    placeholderData: keepPreviousData,
  });

  const preload = top.data?.pages ?? [];
  if (wanted !== '') return searched(wanted, settled, preload, server);
  const pages = preload.map((page) => [
    ...page.topics.map(fromTopic),
    ...page.rows.map(fromSuggestion),
  ]);
  return paged('idle', pages, top, true);
}

/**
 * The rows for the non-blank `wanted` text: the slice's matches merged with the server's pages
 * (`server` asks for `settled`, the text as it last stood still).
 */
function searched(
  wanted: string,
  settled: string,
  preload: TopSuggestions[],
  server: UseInfiniteQueryResult<InfiniteData<SuggestionList>>,
): ExploreResults {
  const lower = wanted.toLowerCase();
  const slice = sliceMatches(preload, lower);
  // Whether the server's answer, if any, is for this text (not an earlier one's, kept meanwhile).
  const own = settled === wanted && !server.isPlaceholderData;
  const answered = (server.data?.pages ?? []).map((page) => page.suggestions.map(fromSuggestion));
  // An earlier text's answer: only its rows that still match the text.
  const previous = answered.flat().filter((row) => matchTier(row.label, lower) !== null);
  const [first = [], ...later] = own ? answered : [previous];
  const pages = [[...slice.open, ...first, ...slice.rows], ...later];
  if (settled === wanted && server.isError) return paged('error', pages, server, own);
  return paged(own && server.isSuccess ? 'ready' : 'loading', pages, server, own);
}
