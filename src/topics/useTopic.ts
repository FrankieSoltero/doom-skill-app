/**
 * One topic's detail (`GET /topics/{slug}`) through the server-state cache: its title, end state
 * and milestones. Until the topic is `ready`, its end state is `null` and it has no milestones.
 */
import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '../api/errors';
import { asApiError, requireApi } from '../api/query';
import type { components } from '../api/schema';

export type TopicDetail = components['schemas']['TopicDetail'];

type TopicState = {
  status: 'loading' | 'ready' | 'error';
  topic?: TopicDetail;
  error?: ApiError;
  /** Asks again, after an error. */
  retry: () => void;
};

async function fetchTopic(slug: string, signal: AbortSignal): Promise<TopicDetail> {
  const { data } = await requireApi().GET('/topics/{slug}', { params: { path: { slug } }, signal });
  if (data === undefined) throw new Error('The topic request gave no body');
  return data;
}

/** The topic `slug` (see the module comment). */
export function useTopic(slug: string): TopicState {
  const result = useQuery({
    queryKey: ['topic', slug],
    queryFn: ({ signal }) => fetchTopic(slug, signal),
  });
  const retry = () => {
    void result.refetch();
  };
  if (result.isSuccess) return { status: 'ready', topic: result.data, retry };
  const error = asApiError(result.error);
  if (error !== undefined) return { status: 'error', error, retry };
  return { status: 'loading', retry };
}
