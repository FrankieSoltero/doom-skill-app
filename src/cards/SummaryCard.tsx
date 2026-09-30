import { StyleSheet, Text, View } from 'react-native';

import { BoldText } from '../components/BoldText';
import { CardFrame } from '../components/CardFrame';
import { streakCount } from '../components/feedHeaderText';
import { MasteryRow } from '../components/MasteryRow';
import { StatTile } from '../components/StatTile';
import { copy } from '../copy';
import type { FeedSet, Summary } from '../data';
import { useFeedStore } from '../feed/store';
import type { NextSetStatus } from '../feed/useFeedSession';
import { useSummary } from '../feed/useSummary';
import { colors, type } from '../theme';
import { SummaryActions } from './SummaryActions';
import { progressPercent, summaryTitle } from './summaryText';

// Summary values from docs/design/card-feed/README.md:143-153 and the prototype,
// docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:243-265, that the theme lacks.
/** Gap between the two stat tiles, prototype line 249 (`gap:8px`). */
const TILES_GAP = 8;
/** Gap between the mastery heading and its rows, prototype line 253 (`gap:10px`). */
export const MASTERY_GAP = 10;
/**
 * The title's most lines. The design's title fits two lines at 50 points (README.md:146); a
 * longer count ("Twelve cards. Eighteen minutes.") is shrunk to fit them, down to this scale, so
 * the card's buttons stay on the card.
 */
export const TITLE_LINES = 2;
const TITLE_MIN_SCALE = 0.6;

export type SummaryCardProps = {
  /** The set just finished: its topic (day, progress) and its Summary data. */
  set: FeedSet;
  /**
   * True while the Summary is the current page: only then is the recorded summary asked for
   * (`useSummary`). Nothing here moves yet (the title, tiles and bars are static); the Summary's
   * motion will start from it too.
   */
  active: boolean;
  /** Loads the next set: `Keep going`, and `Retry` after a failure. */
  onKeepGoing: () => void;
  /** Switches to the Tree tab. */
  onViewTree: () => void;
  /** Where loading the next set stands. */
  nextSetStatus: NextSetStatus;
};

/** A mastery row's bar color by position, README.md:151: violet, coral, yellow, then again. */
function masteryColor(position: number): string {
  const step = position % 3;
  if (step === 0) return colors.violet;
  return step === 1 ? colors.coral : colors.yellow;
}

/**
 * The most mastery rows the Summary draws: the design shows three (README.md:151), and the card's
 * height budget (`__tests__/SummaryCard.height.test.ts`) counts this many, so more would push the
 * buttons off the card.
 */
export const MAX_MASTERY_ROWS = 3;

/**
 * "Mastery moved" and one row for each of the first `MAX_MASTERY_ROWS` moved nodes; the rest are
 * dropped without a word. Nothing when no node moved.
 */
function MasteryList({ moved }: { moved: Summary['moved'] }) {
  if (moved.length === 0) return null;
  return (
    <View style={styles.mastery}>
      <Text style={styles.masteryHeading}>{copy.masteryMoved}</Text>
      {moved.slice(0, MAX_MASTERY_ROWS).map(([name, from, to], position) => (
        <MasteryRow key={position} name={name} from={from} to={to} color={masteryColor(position)} />
      ))}
    </View>
  );
}

/**
 * The last page of every set (docs/design/card-feed/README.md:143-153, spec section 1a): on the
 * ink card, the kicker "DAY 4 COMPLETE"; the title, counting every card and minute of the session
 * so far from the store's totals; the streak (coral) and topic progress (aqua) tiles; the mastery
 * rows; tomorrow's node and reminder; and the buttons. Everything is static: the title is lime,
 * with no gradient, shine or count-up, and the bars are drawn at their final values. The session
 * adds the set to the totals and raises the streak when this page is reached; this card only
 * reads them. The progress delta, the mastery rows and tomorrow come from the set's recorded
 * summary once the store holds it (`useSummary`), else from the projected one the set came with.
 */
export function SummaryCard({
  set,
  active,
  onKeepGoing,
  onViewTree,
  nextSetStatus,
}: SummaryCardProps) {
  const totals = useFeedStore((state) => state.totals);
  const streak = useFeedStore((state) => state.streak);
  const recorded = useFeedStore((state) => state.recordedSummary);
  useSummary(active);
  const { topic } = set;
  const summary = recorded ?? set.summary;

  return (
    <CardFrame type="summary" kicker={copy.dayComplete(topic.day)}>
      <Text
        accessibilityRole="header"
        numberOfLines={TITLE_LINES}
        adjustsFontSizeToFit
        minimumFontScale={TITLE_MIN_SCALE}
        style={styles.title}
      >
        {summaryTitle(totals.cards, totals.seconds)}
      </Text>
      <View style={styles.tiles}>
        <StatTile value={String(streakCount(streak))} label={copy.dayStreak} fill={colors.coral} />
        <StatTile
          value={progressPercent(topic.progress)}
          label={copy.topicProgress(summary.progressDelta)}
          fill={colors.aqua}
        />
      </View>
      <MasteryList moved={summary.moved} />
      <View style={styles.fill} />
      <BoldText text={copy.tomorrow(summary.tomorrow, summary.reminder)} style={styles.footer} />
      <SummaryActions status={nextSetStatus} onKeepGoing={onKeepGoing} onViewTree={onViewTree} />
    </CardFrame>
  );
}

const styles = StyleSheet.create({
  title: { ...type.summaryTitle, color: colors.lime },
  tiles: { flexDirection: 'row', gap: TILES_GAP },
  mastery: { gap: MASTERY_GAP },
  masteryHeading: { ...type.caption, color: colors.neutral[400] },
  fill: { flex: 1 },
  footer: { ...type.small, color: colors.neutral[400] },
});
