/**
 * A topic's skill tree (`GET /topics/{slug}/tree`) through the server-state cache: its milestones,
 * and its nodes in topological order, each with the user's mastery (0 to 1) and whether it is
 * unlocked. The API answers 409 until the topic is ready.
 *
 * Mastery changes as the learner answers cards, so the tree is read again each time the screen
 * returns to focus once it has been read (Expo Router's `useFocusEffect`). Without a topic it is
 * `idle` and asks nothing.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import type { ApiError } from '../api/errors';
import { asApiError, requireApi } from '../api/query';
import type { components } from '../api/schema';

export type Tree = components['schemas']['TopicTree'];

type TreeState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  tree?: Tree;
  error?: ApiError;
  /** Asks again, after an error. */
  retry: () => void;
};

async function fetchTree(slug: string, signal: AbortSignal): Promise<Tree> {
  const { data } = await requireApi().GET('/topics/{slug}/tree', {
    params: { path: { slug } },
    signal,
  });
  if (data === undefined) throw new Error('The tree request gave no body');
  return data;
}

/** The tree of `slug`, or nothing for `null` (see the module comment). */
export function useTree(slug: string | null): TreeState {
  const cache = useQueryClient();
  const result = useQuery({
    queryKey: ['tree', slug],
    queryFn: ({ signal }) => fetchTree(slug ?? '', signal),
    enabled: slug !== null,
  });
  useFocusEffect(
    useCallback(() => {
      const queryKey = ['tree', slug];
      if (slug !== null && cache.getQueryState(queryKey)?.data !== undefined) {
        void cache.refetchQueries({ queryKey, exact: true });
      }
    }, [cache, slug]),
  );

  const retry = () => {
    void result.refetch();
  };
  if (slug === null) return { status: 'idle', retry };
  if (result.isSuccess) return { status: 'ready', tree: result.data, retry };
  const error = asApiError(result.error);
  if (error !== undefined) return { status: 'error', error, retry };
  return { status: 'loading', retry };
}
