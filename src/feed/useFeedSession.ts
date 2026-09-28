// The Today feed's session: loads sets from a card source into the store and turns the learner's
// moves into store actions under the gating rule. No rendering; the screen draws what it returns.
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { Card, CardSource, FeedSet } from '../data';
import { logError, logWarning } from '../log';
import type { CardAnswer } from './answers';
import { isAnswered } from './gating';
import { useFeedStore } from './store';

/**
 * How long the gating toast shows, docs/design/card-feed/README.md:44 ("auto-dismissed after
 * 1.4s"). The theme's `motion` holds no toast duration.
 */
const TOAST_MS = 1400;

type SessionStatus = 'loading' | 'ready' | 'error' | 'empty';
type NextSetStatus = 'idle' | 'loading' | 'error' | 'none';
type CardFilter = (card: Card) => boolean;

const acceptAll: CardFilter = () => true;

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

/** What one kind of load does as it starts, and with the source's answer. */
type LoadHandlers = {
  start: () => void;
  /** A set with at least one card the screen can render, or `null` for "nothing to show". */
  loaded: (set: FeedSet | null) => void;
  failed: (error: unknown) => void;
};

/**
 * A function that asks `source` for a set, one request at a time: a call while one is in flight
 * does nothing. An answer that arrives after the component unmounted is dropped unseen.
 */
function useSetRequest(source: CardSource, canRender: CardFilter) {
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
      const set = await source.getNextSet();
      if (alive.current) handlers.loaded(set === null ? null : renderablePart(set, canRender));
    } catch (error) {
      if (alive.current) handlers.failed(error);
    } finally {
      busy.current = false;
    }
  };
}

/**
 * The first set, asked for on mount (and again by `retry`), and the sets after it (`loadNextSet`).
 * `onSet` starts a loaded set.
 */
function useSetLoads(source: CardSource, canRender: CardFilter, onSet: (set: FeedSet) => void) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [nextSetStatus, setNextSetStatus] = useState<NextSetStatus>('idle');
  const request = useSetRequest(source, canRender);

  const firstSet: LoadHandlers = {
    start: () => {
      setStatus('loading');
    },
    loaded: (set) => {
      if (set !== null) onSet(set);
      setStatus(set === null ? 'empty' : 'ready');
    },
    failed: (error) => {
      logError('feed_load_failed', error);
      setStatus('error');
    },
  };
  const nextSet: LoadHandlers = {
    start: () => {
      setNextSetStatus('loading');
    },
    loaded: (set) => {
      if (set !== null) onSet(set);
      setNextSetStatus(set === null ? 'none' : 'idle');
    },
    failed: (error) => {
      logError('next_set_load_failed', error);
      setNextSetStatus('error');
    },
  };

  const loadFirstSet = useEffectEvent(() => {
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

/** Which set of pages is shown (a count of sets started), and which of its pages failed to render. */
function usePageState() {
  const [pages, setPages] = useState({ round: 0, failed: NO_FAILED_PAGES });

  return {
    ...pages,
    restart: () => {
      setPages((current) => ({ round: current.round + 1, failed: NO_FAILED_PAGES }));
    },
    markFailed: (page: number) => {
      setPages((current) =>
        current.failed.has(page)
          ? current
          : { ...current, failed: new Set([...current.failed, page]) },
      );
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

/**
 * True when the learner may move on from `index`: a card that is answered, or that failed to
 * render (so a broken card does not trap the learner). Never from the Summary page, the last one.
 */
function canAdvanceFrom(
  set: FeedSet | null,
  index: number,
  answers: Record<number, CardAnswer>,
  failed: ReadonlySet<number>,
): boolean {
  const card = set?.cards[index];
  if (card === undefined) return false;
  return failed.has(index) || isAnswered(card, answers[index]);
}

/** Shows page `index`. Arriving on the Summary page adds the set to the day (the store counts it once). */
function moveTo(index: number): void {
  const store = useFeedStore.getState();
  store.setIndex(index);
  const { set, index: shown } = useFeedStore.getState();
  if (shown === set?.cards.length) store.reachSummary();
}

/**
 * The Today feed's session over `source`. The first set is asked for on mount. Each loaded set
 * keeps only the cards `canRender` accepts (default: all), so the store, the header and the pager
 * all see the same cards; a set with none left counts as no set.
 *
 * - `status`: the first set's load. `retry` asks the source again after an error.
 * - `set`, `index`: the store's set and page. The last page is the Summary.
 * - `canAdvance`: the gate for moving on from the current page.
 * - `goTo(index)`: shows a page the pager already allowed. `next()`: moves one page on under the
 *   gate, or acts as `blocked()`. `blocked()`: shows the toast (`toastVisible`) for 1.4 s.
 * - `loadNextSet()`: loads and starts the next set; `nextSetStatus` reports it. It never rejects.
 * - `markFailed(index)`: a page's card failed to render; it then counts as answered.
 * - `setRound`: counts the sets started, from 1; it changes with each new set, so the screen can
 *   give the new set's pages fresh keys.
 */
export function useFeedSession(source: CardSource, canRender: CardFilter = acceptAll) {
  const set = useFeedStore((state) => state.set);
  const index = useFeedStore((state) => state.index);
  const answers = useFeedStore((state) => state.answers);
  const pages = usePageState();
  const toast = useToast();
  const loads = useSetLoads(source, canRender, (loaded) => {
    useFeedStore.getState().startSet(loaded);
    pages.restart();
  });
  const canAdvance = canAdvanceFrom(set, index, answers, pages.failed);

  return {
    status: loads.status,
    set,
    index,
    canAdvance,
    toastVisible: toast.visible,
    goTo: moveTo,
    next: () => {
      if (canAdvance) moveTo(index + 1);
      else toast.show();
    },
    blocked: toast.show,
    retry: loads.retry,
    loadNextSet: loads.loadNextSet,
    nextSetStatus: loads.nextSetStatus,
    markFailed: pages.markFailed,
    setRound: pages.round,
  };
}
