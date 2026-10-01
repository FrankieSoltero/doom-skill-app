/**
 * The server's grade of a checkpoint (M5). The on-phone result (src/feed/checkpoint.ts) shows at
 * once and decides whether the learner may move on; the server's grade arrives later, is shown
 * under it, and decides milestone progress on the server.
 *
 * - `submit(code, localPassed)` posts the code (`POST /milestones/{id}/submit`) with a new
 *   `client_submission_id` and the on-phone result, for a card the API served (it has an id).
 *   A demo card has none: nothing is posted and the result stays `none`. A submit is never sent
 *   again on its own: a failure, a 429 above all (it lasts until the learner's midnight), shows
 *   `unavailable`. A later submit is a new submission with a new id.
 * - While the grade is pending it asks `GET /checkpoints/{id}` every 3 s, for at most 2 minutes
 *   from the submit, then shows `unavailable`. A `failed` grade, or a poll refused for good (a
 *   404, a 429), shows `unavailable` at once; a poll that met the network or a time limit is
 *   asked again on the next tick.
 * - Polling stops while the card is off the screen (`active` false) and resumes when it returns,
 *   within the same 2 minutes. No timer outlives the component: each is cleared, and the poll
 *   in flight cancelled, when the card leaves the screen or unmounts. A submit answer that
 *   arrives after the unmount, or after a later submit or `reset`, is dropped.
 * - `reset()` (the code was edited) forgets the result and stops polling.
 *
 * The result holds the server's grade as the API sent it; a failure keeps only its kind for the
 * log, never the server's text.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { newUuid } from '../api/client';
import { ApiError } from '../api/errors';
import { requireApi } from '../api/query';
import type { components } from '../api/schema';
import { logWarning } from '../log';
import { kindOf } from './outboxQueue';

/** The server's grade of one submission. */
type ServerGrade = components['schemas']['CheckpointGrade'];

/** What the card shows of the server's grade. */
export type ServerResult =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'unavailable' }
  | { status: 'graded'; grade: ServerGrade };

/** Between two polls. */
const POLL_MS = 3000;
/** How long a submission is followed, from the submit. */
const MAX_WAIT_MS = 120_000;
/** The server stores at most this many characters of code; more is refused. */
const MAX_CODE_CHARACTERS = 5000;
/** The poll failures worth asking again: no answer, or the server down for now. */
const TRANSIENT: ReadonlySet<string> = new Set(['offline', 'timeout', 'unavailable']);

const NONE: ServerResult = { status: 'none' };
const PENDING: ServerResult = { status: 'pending' };
const UNAVAILABLE: ServerResult = { status: 'unavailable' };

type Submission = { id: string; deadline: number };

/** `code` cut to 5,000 characters, counted as the server counts them. */
function cut(code: string): string {
  return Array.from(code).slice(0, MAX_CODE_CHARACTERS).join('');
}

/** Posts a submission; its id, or `null` when the server already marked it failed. */
async function postSubmission(
  milestoneId: string,
  code: string,
  localPassed: boolean,
): Promise<string | null> {
  const { data } = await requireApi().POST('/milestones/{milestone_id}/submit', {
    params: { path: { milestone_id: milestoneId } },
    body: { client_submission_id: newUuid(), code: cut(code), local_passed: localPassed },
  });
  if (data === undefined) throw new Error('The submission gave no body');
  return data.status === 'failed' ? null : data.submission_id;
}

/** One poll: the result to show, or `null` to ask again on the next tick. */
async function poll(id: string, signal: AbortSignal): Promise<ServerResult | null> {
  try {
    const { data: grade } = await requireApi().GET('/checkpoints/{submission_id}', {
      params: { path: { submission_id: id } },
      signal,
    });
    if (grade === undefined) throw new Error('The grade gave no body');
    if (grade.status === 'graded') return { status: 'graded', grade };
    return grade.status === 'failed' ? UNAVAILABLE : null;
  } catch (error) {
    if (signal.aborted) return null;
    logWarning('checkpoint_poll_failed', { kind: kindOf(error) });
    return error instanceof ApiError && TRANSIENT.has(error.kind) ? null : UNAVAILABLE;
  }
}

/**
 * Polls `submission` every 3 s while `active`, until a result or its deadline, then hands the
 * result to `finish`. Everything it started stops when the effect is cleaned up.
 */
function usePolling(
  submission: Submission | null,
  active: boolean,
  finish: (result: ServerResult) => void,
): void {
  useEffect(() => {
    if (submission === null || !active) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      timer = null;
      if (Date.now() >= submission.deadline) {
        finish(UNAVAILABLE);
        return;
      }
      const result = await poll(submission.id, controller.signal);
      if (controller.signal.aborted) return;
      if (result === null) {
        timer = setTimeout(() => void tick(), POLL_MS);
      } else {
        finish(result);
      }
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, [submission, active, finish]);
}

/** The server's grade of the checkpoint `milestoneId` (see the module comment). */
export function useCheckpointResult(milestoneId: string | undefined, active: boolean) {
  const [result, setResult] = useState<ServerResult>(NONE);
  const [submission, setSubmission] = useState<Submission | null>(null);
  // Raised by every submit, reset and the unmount: an answer for an older value is dropped.
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const finish = useCallback((next: ServerResult) => {
    setSubmission(null);
    setResult(next);
  }, []);
  usePolling(submission, active, finish);

  const reset = useCallback(() => {
    generation.current += 1;
    finish(NONE);
  }, [finish]);

  const submit = useCallback(
    (code: string, localPassed: boolean) => {
      if (milestoneId === undefined) return;
      generation.current += 1;
      const mine = generation.current;
      const deadline = Date.now() + MAX_WAIT_MS;
      finish(PENDING);
      postSubmission(milestoneId, code, localPassed)
        .then((id) => {
          if (generation.current !== mine) return;
          if (id === null) finish(UNAVAILABLE);
          else setSubmission({ id, deadline });
        })
        .catch((error: unknown) => {
          logWarning('checkpoint_submit_failed', { kind: kindOf(error) });
          if (generation.current === mine) finish(UNAVAILABLE);
        });
    },
    [milestoneId, finish],
  );

  return { result, submit, reset };
}
