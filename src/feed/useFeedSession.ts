// The Today feed's session: loads sets from a card source into the store and turns the learner's
// moves into store actions under the gating rule. No rendering; the screen draws what it returns.
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { FeedLoadError, type Card, type CardSource, type FeedSet } from '../data';
import { logError, logWarning } from '../log';
import { canAdvanceFrom, canGoTo, nextMove } from './feedGate';
// Loaded for its effect: the app's attempt outbox installs itself as the store's sink for answered
// cards, so it is in place before the session draws any card.
import './outbox';
import { useFeedStore } from './store';

/**
 * How long the gating toast shows, docs/design/card-feed/README.md:44 ("auto-dismissed after
 * 1.4s"). The theme's `motion` holds no toast duration.
 */
const TOAST_MS = 1400;

type SessionStatus = 'loading' | 'ready' | 'error' | 'empty' | 'noTopic';
/** Where loading the next set stands: the hook's `nextSetStatus`, which the Summary shows. */
export type NextSetStatus = 'idle' | 'loading' | 'error' | 'none';
type CardFilter = (card: Card) => boolean;

const acceptAll: CardFilter = () => true;

/** True for the source's failure when the learner has no active topic: nothing was asked. */
function isNoTopic(error: unknown): boolean {
  return error instanceof FeedLoadError && error.kind === 'noTopic';
}

/** No page has failed. Shared and read-only; a failure makes a new set. */
const NO_FAILED_PAGES: ReadonlySet<number> = new Set();

/**
 * `set` with only the cards `canRender` accepts, or `null` when none is left. Logs one warning per
 * skipped card type, never the card's text.
 */
function renderablePart(set: FeedSet, canRender: CardFilter): FeedSet | null {
  const skipped = new Set<Card['type']>();
  const cards = set.cards.filter((card) => {
    const kept = canRender(card);
    if (!kept) skipped.add(card.type);
    return kept;
  });
  skipped.forEach((type) => {
    logWarning('card_type_skipped', { type });
  });
  return cards.length > 0 ? { ...set, cards } : null;
}

/** What one kind of load does to the hook's own state as it starts, and with the source's answer. */
type LoadHandlers = {
  start: () => void;
  /** A set with at least one card the screen can render, or `null` for "nothing to show". */
  loaded: (set: FeedSet | null) => void;
  failed: (error: unknown) => void;
};

/**
 * A function that asks `source` for a set, one request at a time: a call while one is in flight
 * does nothing. A set that arrives is passed to `onSet` (which starts it in the global store)
 * even after the component unmounted: the source has already moved past it, so dropping it would
 * skip a set. Only the handlers, which update the hook's own state, are skipped after unmount; a
 * failure then is dropped unseen.
 */
function useSetRequest(source: CardSource, canRender: CardFilter, onSet: (set: FeedSet) => void) {
  const alive = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return async (handlers: LoadHandlers): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    handlers.start();
    try {
      const answer = await source.getNextSet();
      const set = answer === null ? null : renderablePart(answer, canRender);
      if (set !== null) onSet(set);
      if (alive.current) handlers.loaded(set);
    } catch (error) {
      if (alive.current) handlers.failed(error);
    } finally {
      busy.current = false;
    }
  };
}

/** `ready` when the store already holds a set in progress, else `loading`. */
function resumedStatus(): SessionStatus {
  return useFeedStore.getState().set === null ? 'loading' : 'ready';
}

/**
 * The first set, asked for on mount (and again by `retry`), and the sets after it (`loadNextSet`).
 * `onSet` starts a loaded set. A set the store already holds is resumed, not asked for again: a
 * remount or a Fast Refresh re-runs the mount effect, and asking again would lose the set in
 * progress (a source that has run out answers `null`; a looping one starts the next set).
 */
function useSetLoads(source: CardSource, canRender: CardFilter, onSet: (set: FeedSet) => void) {
  const [status, setStatus] = useState<SessionStatus>(resumedStatus);
  const [nextSetStatus, setNextSetStatus] = useState<NextSetStatus>('idle');
  const request = useSetRequest(source, canRender, onSet);

  const firstSet: LoadHandlers = {
    start: () => {
      setStatus('loading');
    },
    loaded: (set) => {
      setStatus(set === null ? 'empty' : 'ready');
    },
    failed: (error) => {
      if (isNoTopic(error)) {
        setStatus('noTopic');
        return;
      }
      logError('feed_load_failed', error);
      setStatus('error');
    },
  };
  const nextSet: LoadHandlers = {
    start: () => {
      setNextSetStatus('loading');
    },
    loaded: (set) => {
      setNextSetStatus(set === null ? 'none' : 'idle');
    },
    failed: (error) => {
      logError('next_set_load_failed', error);
      setNextSetStatus('error');
    },
  };

  const loadFirstSet = useEffectEvent(() => {
    // A set in progress is resumed as it is (it was filtered when it started). Status is already
    // `ready` then: it starts from the store (`resumedStatus`), and a Fast Refresh keeps it.
    if (useFeedStore.getState().set !== null) return;
    void request(firstSet);
  });
  useEffect(() => {
    loadFirstSet();
  }, []);

  return {
    status,
    nextSetStatus,
    retry: () => {
      void request(firstSet);
    },
    loadNextSet: () => request(nextSet),
  };
}

/** Pages of one round's set that failed to render. */
type FailedPages = { round: number; pages: ReadonlySet<number> };

/**
 * The pages that failed to render, kept per round: a new set (a new round in the store) starts
 * with none, however it was started. They are also kept in a ref, so a move reads them as they
 * are when it happens.
 */
function useFailedPages(round: number) {
  const [failed, setFailed] = useState<FailedPages>({ round: 0, pages: NO_FAILED_PAGES });
  const failedNow = useRef(failed);
  const pagesOf = (entry: FailedPages, current: number) =>
    entry.round === current ? entry.pages : NO_FAILED_PAGES;

  return {
    failed: pagesOf(failed, round),
    failedNow: () => pagesOf(failedNow.current, useFeedStore.getState().round),
    markFailed: (page: number) => {
      const current = useFeedStore.getState().round;
      const pages = pagesOf(failedNow.current, current);
      if (pages.has(page)) return;
      const entry = { round: current, pages: new Set([...pages, page]) };
      failedNow.current = entry;
      setFailed(entry);
    },
  };
}

/** The gating toast: shown for TOAST_MS; showing it again restarts the time. */
function useToast() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  return {
    visible,
    show: () => {
      clearTimeout(timer.current);
      setVisible(true);
      timer.current = setTimeout(() => {
        setVisible(false);
      }, TOAST_MS);
    },
  };
}

/** Shows page `index`. Arriving on the Summary page adds the set to the day (the store counts it once). */
function moveTo(index: number): void {
  const store = useFeedStore.getState();
  store.setIndex(index);
  const { set, index: shown } = useFeedStore.getState();
  if (shown === set?.cards.length) store.reachSummary();
}

/** The session's status: `ready` whenever the store holds a set, else the first load's status. */
function sessionStatus(set: FeedSet | null, loaded: SessionStatus): SessionStatus {
  return set === null ? loaded : 'ready';
}

/**
 * The Today feed's session over `source`. On mount it resumes the set the store holds, or asks
 * `source` for the first set. Each loaded set
 * keeps only the cards `canRender` accepts (default: all), so the store, the header and the pager
 * all see the same cards; a set with none left counts as no set.
 *
 * - `status`: `ready` whenever the store holds a set; otherwise the first set's load (`loading`,
 *   `error`, `empty`, or `noTopic` when the source has no active topic to ask for). `retry` asks
 *   the source again after an error.
 * - `set`, `index`: the store's set and page. The last page is the Summary.
 * - `canAdvance`: the gate for moving on from the current page.
 * - `goTo(index)`: shows a page: any page back, or the next one through an open gate; anything
 *   else is ignored.
 * - `nextFrom(page, round)`: what a card on `page` of round `round`'s set calls to move on. When
 *   that is the current card page of the current round it moves one page on through an open
 *   gate, or acts as `blocked()`; otherwise (a card of an earlier set, a page the learner has
 *   left, or the Summary) it does nothing. `next()` is `nextFrom` the current page and round.
 * - `blocked()`: shows the toast (`toastVisible`) for 1.4 s.
 * - Every move reads the store when it is made, so answering and moving on in one handler works.
 * - `loadNextSet()`: loads and starts the next set; `nextSetStatus` reports it. It never rejects.
 * - `markFailed(index)`: a page's card failed to render; it then counts as answered.
 * - `setRound`: the store's `round`, which counts the sets started, from 1. It changes in the same
 *   store update as `set`, so the screen can give the new set's pages fresh keys.
 */
export function useFeedSession(source: CardSource, canRender: CardFilter = acceptAll) {
  const set = useFeedStore((state) => state.set);
  const index = useFeedStore((state) => state.index);
  const answers = useFeedStore((state) => state.answers);
  const round = useFeedStore((state) => state.round);
  const failed = useFailedPages(round);
  const toast = useToast();
  const loads = useSetLoads(source, canRender, (loaded) => {
    useFeedStore.getState().startSet(loaded);
  });
  // Moves read the store and the failed pages when they happen, not as this render saw them: a
  // card may answer and move on in one handler, or move on from a timer.
  const nextFrom = (page: number, pageRound: number) => {
    const move = nextMove(useFeedStore.getState(), failed.failedNow(), { page, round: pageRound });
    if (move === 'go') moveTo(page + 1);
    if (move === 'blocked') toast.show();
  };

  return {
    status: sessionStatus(set, loads.status),
    set,
    index,
    canAdvance: canAdvanceFrom({ set, index, answers, round }, failed.failed),
    toastVisible: toast.visible,
    goTo: (target: number) => {
      if (canGoTo(useFeedStore.getState(), failed.failedNow(), target)) moveTo(target);
    },
    next: () => {
      const now = useFeedStore.getState();
      nextFrom(now.index, now.round);
    },
    nextFrom,
    blocked: toast.show,
    retry: loads.retry,
    loadNextSet: loads.loadNextSet,
    nextSetStatus: loads.nextSetStatus,
    markFailed: failed.markFailed,
    setRound: round,
  };
}
