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
 * - `level` is what a graded pass finished (M10 plan L, L13): the grade's `level`, or `null` before
 *   a grade and for a grade without one. A grade whose level is `completed` marks stale, once, the
 *   cached server state that finishing a level changes: the profile (its points), the topics list,
 *   the leaderboards, the finished topic (the active one) and the next level's topic.
 * - A completed level whose next level is a choice of projects (`next` = `choose`, M11 plan
 *   decision M21) may come before the projects are drafted (`choices` empty). The grade is then
 *   asked again every 2 s, at most 15 times (`CHOICE_POLL_MS`, `CHOICE_POLLS`), while the card is
 *   on the screen; a grade with the projects replaces the shown one (and marks the cached state
 *   stale again: the projects' level rows now exist), as does any grade whose level no longer
 *   awaits them (a proposal that failed: `next` = `failed`). After the 15th ask without them,
 *   `choicesLater` is true: the learner picks a project on the topic screen. A submit or `reset`
 *   stops the asking and clears `choicesLater`.
 *
 * The result holds the server's grade as the API sent it; a failure keeps only its kind for the
 * log, never the server's text.
 */
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { newUuid } from '../api/client';
import { ApiError } from '../api/errors';
import { queryClient, requireApi } from '../api/query';
import type { components } from '../api/schema';
import { logWarning } from '../log';
import { ME_KEY } from '../profile/me';
import { kindOf } from './outboxQueue';
import { activeTopic } from './useActiveTopic';

/** The server's grade of one submission. */
type ServerGrade = components['schemas']['CheckpointGrade'];

/** What finishing a level unlocked, as the grade carries it. */
export type LevelOutcome = components['schemas']['LevelOutcome'];

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
/** Between two asks for the projects of a level (see the module comment). */
export const CHOICE_POLL_MS = 2000;
/** The most asks for the projects of a level, then they are picked on the topic screen. */
export const CHOICE_POLLS = 15;
/** The poll failures worth asking again: no answer, or the server down for now. */
const TRANSIENT: ReadonlySet<string> = new Set(['offline', 'timeout', 'unavailable']);

const NONE: ServerResult = { status: 'none' };
const PENDING: ServerResult = { status: 'pending' };
const UNAVAILABLE: ServerResult = { status: 'unavailable' };

type Submission = { id: string; deadline: number };

/** The level `result` completed, when its grade has one. */
function levelOf(result: ServerResult): LevelOutcome | null {
  return result.status === 'graded' ? (result.grade.level ?? null) : null;
}

/** Whether `result` completed a level whose projects are not drafted yet. */
function awaitsChoices(result: ServerResult): boolean {
  const level = levelOf(result);
  return level?.completed === true && level.next === 'choose' && level.choices.length === 0;
}

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
 * result and the submission's id to `finish`. Everything it started stops when the effect is
 * cleaned up.
 */
function usePolling(
  submission: Submission | null,
  active: boolean,
  finish: (result: ServerResult, id: string) => void,
): void {
  useEffect(() => {
    if (submission === null || !active) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      timer = null;
      if (Date.now() >= submission.deadline) {
        finish(UNAVAILABLE, submission.id);
        return;
      }
      const result = await poll(submission.id, controller.signal);
      if (controller.signal.aborted) return;
      if (result === null) {
        timer = setTimeout(() => void tick(), POLL_MS);
      } else {
        finish(result, submission.id);
      }
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, [submission, active, finish]);
}

/**
 * Asks for the grade of `drafting` (a submission's id) every 2 s while `active`, counting the asks
 * in `asked`, which outlives a pause: a grade with the projects goes to `offer`; after the last ask
 * without them, `later` is called. Everything it started stops when the effect is cleaned up.
 */
function useChoicePolling(
  drafting: string | null,
  active: boolean,
  asked: RefObject<number>,
  done: { offer: (result: ServerResult) => void; later: () => void },
): void {
  const { offer, later } = done;
  useEffect(() => {
    if (drafting === null || !active) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      timer = null;
      const result = await poll(drafting, controller.signal);
      if (controller.signal.aborted) return;
      asked.current += 1;
      const level = result === null ? null : levelOf(result);
      const awaiting = level !== null && level.next === 'choose' && level.choices.length === 0;
      if (result !== null && level !== null && !awaiting) offer(result);
      else if (asked.current >= CHOICE_POLLS) later();
      else timer = setTimeout(() => void tick(), CHOICE_POLL_MS);
    };
    timer = setTimeout(() => void tick(), CHOICE_POLL_MS);
    return () => {
      controller.abort();
      if (timer !== null) clearTimeout(timer);
    };
  }, [drafting, active, asked, offer, later]);
}

/** Marks stale the cached server state a completed `level` changes (see the module comment). */
function refreshAfterLevel(level: LevelOutcome): void {
  const slugs = [activeTopic(), level.next_slug].filter((slug) => slug !== null);
  const keys = [ME_KEY, ['topics'], ['leaderboard'], ...slugs.map((slug) => ['topic', slug])];
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

/** The server's grade of the checkpoint `milestoneId` (see the module comment). */
export function useCheckpointResult(milestoneId: string | undefined, active: boolean) {
  const [result, setResult] = useState<ServerResult>(NONE);
  const [submission, setSubmission] = useState<Submission | null>(null);
  // The submission whose projects are being drafted, and how many times they were asked for.
  const [drafting, setDrafting] = useState<string | null>(null);
  const asked = useRef(0);
  const [choicesLater, setChoicesLater] = useState(false);
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
    setDrafting(null);
    setChoicesLater(false);
    setResult(next);
  }, []);
  const graded = useCallback(
    (next: ServerResult, id: string) => {
      finish(next);
      if (!awaitsChoices(next)) return;
      asked.current = 0;
      setDrafting(id);
    },
    [finish],
  );
  usePolling(submission, active, graded);
  const offer = useCallback((offered: ServerResult) => {
    setDrafting(null);
    setResult(offered);
  }, []);
  const later = useCallback(() => {
    setDrafting(null);
    setChoicesLater(true);
  }, []);
  useChoicePolling(drafting, active, asked, { offer, later });

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

  const level = levelOf(result);
  useEffect(() => {
    if (level?.completed === true) refreshAfterLevel(level);
  }, [level]);

  return { result, submit, reset, level, choicesLater };
}
