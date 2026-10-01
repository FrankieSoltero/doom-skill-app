/**
 * The topic search (`GET /topics?q=`) and the topic request (`POST /topics`) for the Explore tab,
 * through the server-state cache (src/api/query.ts). Types come from the generated schema.
 *
 * - `useTopics(query)` trims the query, cuts it to 80 characters (the API's limit) and asks 300 ms
 *   after the last change. A blank query is `idle` and asks nothing; while it waits or asks, it is
 *   `loading`.
 * - `useCreateTopic().create(query)` gives the topic's slug and title, and its new ingestion job's
 *   id (`null` when the topic existed, a 200); a failure rejects with its `ApiError` (a 422 when
 *   the topic is not supported, a 429 at the pending limit) and is also the hook's `error`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { ApiError } from '../api/errors';
import { asApiError, MUTATION_STATUS, requireApi } from '../api/query';
import type { components } from '../api/schema';

export type TopicSummary = components['schemas']['TopicSummary'];

/** The API's longest query. */
export const MAX_QUERY_LENGTH = 80;

/** How long the search waits after the last change before it asks. */
const DEBOUNCE_MS = 300;

type Status = 'idle' | 'loading' | 'ready' | 'error';

type TopicsState = {
  status: Status;
  topics: TopicSummary[];
  error?: ApiError;
  /** Asks again for the current query, after an error. */
  retry: () => void;
};

/** The query as it is sent: trimmed and cut to the API's limit. */
function cleanQuery(query: string): string {
  return query.trim().slice(0, MAX_QUERY_LENGTH);
}

/** `value`, once it has not changed for `ms`. */
function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return settled;
}

async function searchTopics(q: string, signal: AbortSignal): Promise<TopicSummary[]> {
  const { data } = await requireApi().GET('/topics', { params: { query: { q } }, signal });
  return data?.topics ?? [];
}

/** The topics whose title or slug contains `query` (see the module comment). */
export function useTopics(query: string): TopicsState {
  const wanted = cleanQuery(query);
  const settled = useDebounced(wanted, DEBOUNCE_MS);
  const result = useQuery({
    queryKey: ['topics', settled],
    queryFn: ({ signal }) => searchTopics(settled, signal),
    enabled: settled !== '',
  });

  const retry = () => {
    void result.refetch();
  };
  if (wanted === '') return { status: 'idle', topics: [], retry };
  if (settled !== wanted || result.isPending) return { status: 'loading', topics: [], retry };
  const error = asApiError(result.error);
  if (error !== undefined) return { status: 'error', topics: [], error, retry };
  return { status: 'ready', topics: result.data ?? [], retry };
}

/**
 * What a topic request gives: the topic, its status, and its job's id when one was queued (an
 * ingestion, or for a `proposed` topic the job that proposes its sources).
 */
export type CreatedTopic = {
  slug: string;
  title: string;
  status: TopicSummary['status'];
  jobId: string | null;
};

async function requestTopic(query: string): Promise<CreatedTopic> {
  const { data } = await requireApi().POST('/topics', { body: { query } });
  if (data === undefined) throw new Error('The topic request gave no body');
  const { slug, title, status } = data.topic;
  return { slug, title, status, jobId: data.job_id };
}

/** Requests the topic a query names (see the module comment). */
export function useCreateTopic() {
  const cache = useQueryClient();
  const mutation = useMutation({
    mutationFn: requestTopic,
    // The new topic now matches its query: searches ask again.
    onSuccess: () => cache.invalidateQueries({ queryKey: ['topics'] }),
  });
  const error = asApiError(mutation.error);
  return {
    create: (query: string) => mutation.mutateAsync(cleanQuery(query)),
    status: MUTATION_STATUS[mutation.status],
    ...(error === undefined ? {} : { error }),
  };
}
