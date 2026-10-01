/**
 * A topic's ingestion job, polled (`GET /jobs/{id}`) through the server-state cache.
 *
 * - It asks when the job id is given and the screen is focused, then every 3 s while the job's
 *   `status` is `queued` or `running`.
 * - It stops for good on `done` or `failed`, and 10 minutes after it was given the job id, when it
 *   reports `timeout` (unless the job had finished).
 * - It pauses while the screen is out of focus (Expo Router's `useFocusEffect`) and asks again
 *   when the screen returns.
 * - A failed request is not a result: the last status stays, and the next tick asks again.
 */
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';

type Job = components['schemas']['Job'];

/** Between two requests while the job runs. */
const POLL_MS = 3000;

/** How long a job is followed at most. */
const MAX_POLL_MS = 10 * 60_000;

export type JobView = {
  status: Job['status'] | 'timeout' | null;
  /** Why the job failed or was retried, when the job gives a reason. */
  reason?: string;
};

function isFinished(job: Job | undefined): boolean {
  return job?.status === 'done' || job?.status === 'failed';
}

async function fetchJob(id: string, signal: AbortSignal): Promise<Job> {
  const { data } = await requireApi().GET('/jobs/{id}', { params: { path: { id } }, signal });
  if (data === undefined) throw new Error('The job request gave no body');
  return data;
}

/** True while the screen that uses it is focused. */
function useFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
      };
    }, []),
  );
  return focused;
}

/** True once `ms` have passed since `jobId` was given. */
function useExpired(jobId: string | null, ms: number): boolean {
  const [expired, setExpired] = useState<string | null>(null);
  useEffect(() => {
    if (jobId === null) return undefined;
    const timer = setTimeout(() => {
      setExpired(jobId);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [jobId, ms]);
  return expired !== null && expired === jobId;
}

/** The job's state (see the module comment). */
export function useJob(jobId: string | null): JobView {
  const focused = useFocused();
  const expired = useExpired(jobId, MAX_POLL_MS);
  const { data } = useQuery({
    queryKey: ['job', jobId],
    queryFn: ({ signal }) => fetchJob(jobId ?? '', signal),
    enabled: jobId !== null && focused && !expired,
    staleTime: (query) => (isFinished(query.state.data) ? Infinity : 0),
    refetchInterval: (query) => (isFinished(query.state.data) ? false : POLL_MS),
  });

  if (jobId === null) return { status: null };
  if (expired && !isFinished(data)) return { status: 'timeout' };
  if (data === undefined) return { status: null };
  return data.reason === null
    ? { status: data.status }
    : { status: data.status, reason: data.reason };
}
