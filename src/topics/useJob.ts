/**
 * A topic's ingestion job, polled (`GET /jobs/{id}`) through the server-state cache.
 *
 * - It asks when the job id is given and the screen is focused, then every 3 s while the job's
 *   `status` is `queued` or `running`.
 * - It stops for good on `done` or `failed`, and 10 minutes after it was given the job id, when it
 *   reports `timeout` (unless the job had finished). A server that reports the `stage` reports a
 *   done job's topic still being built (`ingesting`, `synthesizing`, `generating`): it asks on
 *   until the stage is `done`, `waiting` or `failed`.
 * - `ahead` and `stage` are optional: an older server sends neither, and the view then has neither.
 * - It pauses while the screen is out of focus (Expo Router's `useFocusEffect`) and asks again
 *   when the screen returns.
 * - A failed request is not a result: the last status stays, and the next tick asks again.
 */
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { requireApi } from '../api/query';
import type { components } from '../api/schema';

type ServerJob = components['schemas']['Job'];

/** The job as read: `ahead` and `stage` may be missing from an older server's answer. */
type Job = Omit<ServerJob, 'ahead' | 'stage'> & Partial<Pick<ServerJob, 'ahead' | 'stage'>>;

type JobStage = components['schemas']['JobStage'];

/** The stages at which a job's build stops moving. */
const FINAL_STAGES: ReadonlySet<JobStage> = new Set(['done', 'waiting', 'failed']);

/** Between two requests while the job runs. */
const POLL_MS = 3000;

/** How long a job is followed at most. */
const MAX_POLL_MS = 10 * 60_000;

export type JobView = {
  status: Job['status'] | 'timeout' | null;
  /** Why the job failed or was retried, when the job gives a reason. */
  reason?: string;
  /** The queued jobs before this one (0 unless it is queued), when the server reports it. */
  ahead?: number;
  /** Where the build is, when the server reports it. */
  stage?: JobStage;
};

/** True when a done job's topic is no longer being built; always, from a server without stages. */
export function isSettled(stage: JobStage | undefined): boolean {
  return stage === undefined || FINAL_STAGES.has(stage);
}

function isFinished(job: Job | undefined): boolean {
  return job?.status === 'failed' || (job?.status === 'done' && isSettled(job.stage));
}

/** The view of an answer: only the fields the job gives. */
function viewOf(job: Job): JobView {
  const view: JobView = { status: job.status };
  if (job.stage !== undefined) view.stage = job.stage;
  if (job.ahead !== undefined) view.ahead = job.ahead;
  if (job.reason !== null) view.reason = job.reason;
  return view;
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
  return viewOf(data);
}
