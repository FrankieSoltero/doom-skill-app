/**
 * The placement quiz's state (K19), for the placement screen and the topic screen's reset row.
 *
 * - `usePlacement`: the set (`GET /topics/{slug}/placement`), then the intro, one card at a time,
 *   the answers sent once at the end (or a skip), and the result line. The answers live in this
 *   hook's state only: never in storage or a log line. A 409 from either call means the topic is
 *   placed already, and the feed opens at once; a set with no card is skipped without a word; any
 *   other failure shows one fixed line before the feed. Opening the feed makes the topic active
 *   (which starts the Today feed on it: enrolling left that to this screen) and then leaves.
 * - `usePlacementReset`: whether the enrollment has a placement (the set answers 409: the client
 *   reads no body, so a skip counts too, and the server resets a skip as well), and the reset.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { placementCopy } from '../copy/placement';
import type { Placement, PlacementQuiz, PlacementResult } from '../data';
import { useActiveTopic } from '../feed/useActiveTopic';

type Submit = Parameters<Placement['send']>[1];

/** The cache key of whether `slug` has a placement, read by the topic screen. */
const placedKey = (slug: string) => ['placement', slug] as const;

/** Where the quiz stands. `card` counts from 0. */
export type PlacementStep =
  | { kind: 'loading' }
  | { kind: 'intro'; total: number }
  | { kind: 'card'; quiz: PlacementQuiz; index: number }
  | { kind: 'result'; line: string }
  | { kind: 'failed' };

type Phase = 'intro' | 'sending' | 'failed' | { index: number } | { line: string };

/**
 * The result line: the milestone number of the band the learner starts at (the band after the
 * last one passed, or the last band when every band passed) with the title the server sent.
 */
function resultLine(result: PlacementResult, quiz: PlacementQuiz | undefined): string {
  if (result.milestoneTitle === null) return placementCopy.fromTheBeginning;
  const bands = quiz?.bands ?? [];
  const band = bands[Math.min(result.placed, bands.length - 1)];
  return placementCopy.startingAt(band?.milestone ?? result.placed + 1, result.milestoneTitle);
}

/** The step to show for the load's state and the phase. */
function stepOf(quiz: PlacementQuiz | undefined, loadFailed: boolean, phase: Phase): PlacementStep {
  if (loadFailed || phase === 'failed') return { kind: 'failed' };
  if (quiz === undefined || quiz.cards.length === 0 || phase === 'sending') {
    return { kind: 'loading' };
  }
  if (phase === 'intro') return { kind: 'intro', total: quiz.cards.length };
  if ('line' in phase) return { kind: 'result', line: phase.line };
  return { kind: 'card', quiz, index: phase.index };
}

/** Makes the topic active and leaves for the feed, once. */
function useFinish(slug: string, leave: () => void) {
  const cache = useQueryClient();
  const { setActive } = useActiveTopic();
  const left = useRef(false);
  return async () => {
    if (left.current) return;
    left.current = true;
    void cache.invalidateQueries({ queryKey: placedKey(slug), exact: true });
    await setActive(slug);
    leave();
  };
}

/** The placement quiz for `slug` over `calls`; `leave` opens the feed (see the module comment). */
export function usePlacement(slug: string, calls: Placement, leave: () => void) {
  const load = useQuery({
    queryKey: ['placement', slug, 'set'],
    queryFn: () => calls.load(slug),
    staleTime: Infinity,
    gcTime: 0,
  });
  const send = useMutation({ mutationFn: (submit: Submit) => calls.send(slug, submit) });
  const finish = useFinish(slug, leave);
  const [phase, setPhase] = useState<Phase>('intro');
  const answers = useRef<number[]>([]);
  const quiz = load.data?.kind === 'quiz' ? load.data.quiz : undefined;

  const submit = async (body: Submit) => {
    setPhase('sending');
    try {
      const outcome = await send.mutateAsync(body);
      if (outcome.kind === 'placed') await finish();
      else setPhase({ line: resultLine(outcome.result, quiz) });
    } catch {
      setPhase('failed');
    }
  };

  const placedAlready = load.data?.kind === 'placed';
  const empty = quiz?.cards.length === 0;
  const onArrival = useEffectEvent(() => {
    if (placedAlready) void finish();
    // A set with no card: the skip, without a word, then the feed (the step shows loading).
    else if (empty) {
      send.mutateAsync({ skip: true }).then(finish, () => {
        setPhase('failed');
      });
    }
  });
  useEffect(() => {
    onArrival();
  }, [placedAlready, empty]);

  const pick = (choice: number) => {
    if (quiz === undefined || typeof phase !== 'object' || !('index' in phase)) return;
    const { index } = phase;
    answers.current[index] = choice;
    if (index + 1 < quiz.cards.length) {
      setPhase({ index: index + 1 });
      return;
    }
    const picked = quiz.cards.flatMap((card, at) => {
      const choice = answers.current[at];
      return choice === undefined ? [] : [{ cardId: card.id, choice }];
    });
    void submit({ answers: picked });
  };

  return {
    step: stepOf(quiz, load.isError, phase),
    start: () => {
      setPhase({ index: 0 });
    },
    skip: () => void submit({ skip: true }),
    pick,
    goToFeed: () => void finish(),
  };
}

/** Whether `slug`'s enrollment has a placement, and its reset (see the module comment). */
export function usePlacementReset(slug: string, calls: Placement) {
  const cache = useQueryClient();
  const placed = useQuery({ queryKey: placedKey(slug), queryFn: () => calls.load(slug) });
  const reset = useMutation({ mutationFn: () => calls.reset(slug) });
  const [line, setLine] = useState<string | null>(null);

  return {
    placed: placed.data?.kind === 'placed',
    line,
    busy: reset.isPending,
    reset: async () => {
      setLine(null);
      try {
        const outcome = await reset.mutateAsync();
        setLine(outcome === 'limit' ? placementCopy.resetLimit : placementCopy.resetDone);
        if (outcome !== 'limit') {
          await cache.invalidateQueries({ queryKey: placedKey(slug), exact: true });
        }
      } catch {
        setLine(placementCopy.resetFailed);
      }
    },
  };
}
