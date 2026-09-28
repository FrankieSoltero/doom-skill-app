// Test support: a feed set carrying the design's Summary data (docs/design/card-feed/README.md:
// 143-153), for the Summary card and registry tests. Not app code.
import type { FeedSet } from '../../data';
import { cardsByType, makeSet } from '../../feed/testing/sets';

/** The design's three mastery rows, README.md:151. */
const DESIGN_MOVED: FeedSet['summary']['moved'] = [
  ['Alternation < >', 0.42, 0.61],
  ['Speed * and /', 0.55, 0.7],
  ['Rests ~', 0.8, 0.88],
];

/**
 * A set on topic day 4 at 34% progress whose Summary moved `moved` (the design's rows unless
 * given), with a progress delta of 3 and the design's footer.
 */
export function summarySet(moved: FeedSet['summary']['moved'] = DESIGN_MOVED): FeedSet {
  const set = makeSet(12, [cardsByType.concept]);
  return {
    ...set,
    topic: { ...set.topic, day: 4, horizonDays: 14, progress: 0.34 },
    summary: {
      title: 'Six cards. Nine minutes.',
      progressDelta: 3,
      moved,
      tomorrow: 'Euclidean rhythms',
      reminder: '8:30 pm',
    },
  };
}
