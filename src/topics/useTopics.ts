/**
 * The topic request (`POST /topics`) for the Explore tab, through the server-state cache
 * (src/api/query.ts), and the query helpers its results hook (`useExploreResults`) shares. Types
 * come from the generated schema.
 *
 * - `cleanQuery(query)` trims the query and cuts it to 80 characters (the API's limit).
 * - `useCreateTopic().create(query, catalogKey?)` gives the topic's slug and title, and its new
 *   ingestion job's id (`null` when the topic existed, a 200); a failure rejects with its
 *   `ApiError` (a 422 when the topic is not supported, a 429 at the pending limit) and is also the
 *   hook's `error`. A catalog suggestion's request carries its key (`catalog_key`).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { asApiError, MUTATION_STATUS, requireApi } from '../api/query';
import type { components } from '../api/schema';

export type TopicSummary = components['schemas']['TopicSummary'];

/** The API's longest query. */
export const MAX_QUERY_LENGTH = 80;

/** The query as it is sent: trimmed and cut to the API's limit. */
export function cleanQuery(query: string): string {
  return query.trim().slice(0, MAX_QUERY_LENGTH);
}

/** `value`, once it has not changed for `ms`. */
export function useDebounced(value: string, ms: number): string {
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

/** A topic request: the query, and the catalog key when it came from a suggestion. */
type TopicRequest = { query: string; catalogKey: string | undefined };

async function requestTopic({ query, catalogKey }: TopicRequest): Promise<CreatedTopic> {
  const body = catalogKey === undefined ? { query } : { query, catalog_key: catalogKey };
  const { data } = await requireApi().POST('/topics', { body });
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
    create: (query: string, catalogKey?: string) =>
      mutation.mutateAsync({ query: cleanQuery(query), catalogKey }),
    status: MUTATION_STATUS[mutation.status],
    ...(error === undefined ? {} : { error }),
  };
}
