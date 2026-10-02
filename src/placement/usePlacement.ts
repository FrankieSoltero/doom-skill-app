/**
 * The placement quiz's state (K19), for the placement screen and the topic screen's reset row.
 *
 * - `usePlacement`: the set (`GET /topics/{slug}/placement`), then the intro, one card at a time
 *   (a pick within `PICK_GUARD_MS` of a card appearing is ignored, so a double tap answers one
 *   card; each card's progress line is announced on iOS, where the screen's live region does not
 *   work), the answers sent once at the end (or a skip), and the result line. The answers live in this
 *   hook's state only: never in storage or a log line. A 409 from either call means the topic is
 *   placed already, and the feed opens at once; a set with no card is skipped without a word; any
 *   other failure shows one fixed line before the feed. Opening the feed makes the topic active
 *   (which starts the Today feed on it: enrolling left that to this screen) and then leaves.
 * - `usePlacementReset`: whether the enrollment has a placement (the set answers 409: the client
 *   reads no body, so a skip counts too, and the server resets a skip as well), and the reset.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { announce } from '../components/announce';
import { placementCopy } from '../copy/placement';
import type { Placement, PlacementQuiz, PlacementResult } from '../data';
import { refreshFeed, useActiveTopic } from '../feed/useActiveTopic';

type Submit = Parameters<Placement['send']>[1];

/**
 * How long after a card appears a pick is ignored (M8 final review, M4): the second tap of a
 * double tap would otherwise answer the next card, unread, at the same place.
 */
export const PICK_GUARD_MS = 300;

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
 * last one passed) with the title the server sent. The server never passes the last band (K19),
 * so with every answer right the learner starts at the last band; `Math.min` keeps a placement
 * stored before that rule on the last band too.
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

/**
 * Makes the topic active and leaves for the feed, once. After a placement the server stored
 * (`stored`: a result, not a 409 or a failure) it has dropped the topic's stored sets, so a set
 * the app loaded before is dropped too and the feed asks again (`refreshFeed`).
 */
function useFinish(slug: string, leave: () => void) {
  const cache = useQueryClient();
  const { setActive } = useActiveTopic();
  const left = useRef(false);
  return async (stored: boolean) => {
    if (left.current) return;
    left.current = true;
    void cache.invalidateQueries({ queryKey: placedKey(slug), exact: true });
    // Before `setActive`: when the topic is not active yet, choosing it starts its feed afresh
    // anyway, and refreshing after that would start the feed a second time.
    if (stored) refreshFeed(slug);
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
  // When the card on screen appeared (`PICK_GUARD_MS`).
  const shownAt = useRef(0);
  const quiz = load.data?.kind === 'quiz' ? load.data.quiz : undefined;
  /** Shows card `index` and tells VoiceOver its progress line (Android reads the live region). */
  const showCard = (index: number) => {
    shownAt.current = Date.now();
    setPhase({ index });
    if (quiz !== undefined) announce(placementCopy.progress(index + 1, quiz.cards.length));
  };
  // Whether the server stored this placement: the feed is refreshed when the learner leaves.
  const stored = useRef(false);

  const submit = async (body: Submit) => {
    setPhase('sending');
    try {
      const outcome = await send.mutateAsync(body);
      if (outcome.kind === 'placed') {
        await finish(false);
        return;
      }
      stored.current = true;
      setPhase({ line: resultLine(outcome.result, quiz) });
    } catch {
      setPhase('failed');
    }
  };

  const placedAlready = load.data?.kind === 'placed';
  const empty = quiz?.cards.length === 0;
  const onArrival = useEffectEvent(() => {
    if (placedAlready) void finish(false);
    // A set with no card: the skip, without a word, then the feed (the step shows loading).
    else if (empty) {
      send.mutateAsync({ skip: true }).then(
        (outcome) => finish(outcome.kind === 'result'),
        () => {
          setPhase('failed');
        },
      );
    }
  });
  useEffect(() => {
    onArrival();
  }, [placedAlready, empty]);

  const pick = (choice: number) => {
    if (quiz === undefined || typeof phase !== 'object' || !('index' in phase)) return;
    if (Date.now() - shownAt.current < PICK_GUARD_MS) return;
    const { index } = phase;
    answers.current[index] = choice;
    if (index + 1 < quiz.cards.length) {
      showCard(index + 1);
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
      showCard(0);
    },
    skip: () => void submit({ skip: true }),
    pick,
    goToFeed: () => void finish(stored.current),
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
        // The reset dropped the topic's unanswered stored sets: the feed asks again.
        if (outcome === 'reset') refreshFeed(slug);
        if (outcome !== 'limit') {
          await cache.invalidateQueries({ queryKey: placedKey(slug), exact: true });
        }
      } catch {
        setLine(placementCopy.resetFailed);
      }
    },
  };
}
