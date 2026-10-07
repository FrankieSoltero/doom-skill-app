/**
 * One learner action on a question or an answer (M10 plan Q Task 12, spec 3.4): accept, helpful,
 * flag or delete, each a single POST or DELETE.
 *
 * - `useQaAction` sends the request once per press (the client never retries a POST or a DELETE);
 *   the control that runs it is disabled while it is sent (`busy`). A sent action marks the given queries stale, so the
 *   inbox and the card's questions are read again; a refused one keeps its outcome for the row's
 *   line (`qaOutcome`, any other failure `failed`) and is logged by its kind only.
 * - `useTwoTapAction` is the delete (decision Q13): the first press arms it, a second press
 *   within `DELETE_RESET_MS` sends it, and it disarms itself after that time. No dialog.
 */
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { qaOutcome, type QaOutcome, type Question } from '../data/qa';
import { kindOf } from '../feed/outboxQueue';
import { logWarning } from '../log';
import { INBOX_KEY } from './useInbox';

/** How long an armed delete waits for its second press. */
const DELETE_RESET_MS = 5_000;

/** What an action came to: `ok`, a refusal `qaOutcome` names, or `failed` for anything else. */
export type QaActionOutcome = QaOutcome | 'failed';

/** One action: its press, whether it is being sent, and how the last press ended. */
export type QaAction = {
  /** Sends the request. */
  run: () => void;
  /** True while the request is sent. */
  busy: boolean;
  /** The last press's outcome; null before the first and while it is sent. */
  outcome: QaActionOutcome | null;
};

/** The queries an action on `question` or its answers makes stale: the inbox and the card's. */
export function questionKeys(question: Question): QueryKey[] {
  return [INBOX_KEY, ['cardQuestions', question.cardId]];
}

/** Sends `send` on a press and marks `keys` stale after (module comment). */
export function useQaAction(send: () => Promise<unknown>, keys: readonly QueryKey[]): QaAction {
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<QaActionOutcome | null>(null);

  const run = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      await send();
      setOutcome('ok');
      for (const queryKey of keys) void cache.invalidateQueries({ queryKey });
    } catch (error) {
      logWarning('qa_action_failed', { kind: kindOf(error) });
      setOutcome(qaOutcome(error) ?? 'failed');
    } finally {
      setBusy(false);
    }
  };

  return {
    run: () => {
      void run();
    },
    busy,
    outcome,
  };
}

/** A `useQaAction` behind two presses; `armed` after the first. */
export type TwoTapAction = QaAction & { armed: boolean };

/** A `useQaAction` behind two presses (module comment). */
export function useTwoTapAction(
  send: () => Promise<unknown>,
  keys: readonly QueryKey[],
): TwoTapAction {
  const action = useQaAction(send, keys);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarm = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const run = () => {
    if (armed) {
      disarm();
      action.run();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(disarm, DELETE_RESET_MS);
  };
  return { ...action, run, armed };
}
