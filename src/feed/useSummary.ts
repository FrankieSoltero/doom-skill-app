/**
 * The recorded summary (K12). A set arrives with a projected summary, as if every card were
 * answered correctly. When the learner reaches the Summary page and the attempt outbox holds
 * nothing more to send, the set's summary from its recorded attempts (`GET /feed/summary`)
 * replaces it in the store (`recordedSummary`), which the Summary card shows.
 *
 * - While attempts are pending, or when the request fails, the projected summary stays. The
 *   request waits for the outbox to empty while the Summary is the current page.
 * - The numbers change at most once: nothing is asked once the store holds a recorded summary for
 *   the set, the store keeps only the first, and an answer that arrives after the next set started
 *   is dropped. Each card asks at most once per set; a failure is logged by its kind only.
 * - With the demo sets (no API, no set date) it asks nothing.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { FeedLoadError, loadSummary, type FeedSet } from '../data';
import { logWarning } from '../log';
import { outbox, type Outbox } from './outbox';
import { useFeedStore } from './store';

/** What the hook reads: the summary loader (`null` without an API) and the outbox's count. */
export type SummaryDeps = {
  load: typeof loadSummary;
  outbox: Pick<Outbox, 'pending' | 'subscribe'>;
};

const APP_DEPS: SummaryDeps = { load: loadSummary, outbox };

/** A failure's kind: a FeedLoadError's own, else the class name; never its content. */
function failureKind(error: unknown): string {
  if (error instanceof FeedLoadError) return error.kind;
  return error instanceof Error ? error.name : typeof error;
}

/** The set's topic, number and date, when it is a set the API served; else `null`. */
function askFor(set: FeedSet | null) {
  if (set?.feedDate === undefined) return null;
  return { topic: set.topic.slug, setNumber: set.setNumber, feedDate: set.feedDate };
}

/**
 * Replaces the current set's projected summary with the recorded one once, while `active` (the
 * Summary is the current page); see the module comment. `deps` are for tests.
 */
export function useSummary(active: boolean, deps: SummaryDeps = APP_DEPS): void {
  const { load } = deps;
  const pending = useSyncExternalStore(deps.outbox.subscribe, deps.outbox.pending);
  const set = useFeedStore((state) => state.set);
  const round = useFeedStore((state) => state.round);
  const asked = useRef<number | null>(null);

  useEffect(() => {
    const request = askFor(set);
    if (!active || pending > 0 || load === null || request === null) return;
    if (asked.current === round || useFeedStore.getState().recordedSummary !== null) return;
    asked.current = round;
    load(request)
      .then((summary) => {
        useFeedStore.getState().recordSummary(round, summary);
      })
      .catch((error: unknown) => {
        logWarning('summary_load_failed', { kind: failureKind(error) });
      });
  }, [active, pending, load, set, round]);
}
