import { StyleSheet, Text, View } from 'react-native';

import { BoldText } from '../components/BoldText';
import { CardFrame } from '../components/CardFrame';
import { streakCount } from '../components/feedHeaderText';
import { MasteryRow } from '../components/MasteryRow';
import { StatTile } from '../components/StatTile';
import { copy } from '../copy';
import type { FeedSet, Summary } from '../data';
import { useFeedStore } from '../feed/store';
import { colors, type } from '../theme';
import { SummaryActions } from './SummaryActions';
import type { NextSetStatus } from './SummaryActions';
import { progressPercent, summaryTitle } from './summaryText';

// Summary values from docs/design/card-feed/README.md:143-153 and the prototype,
// docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:245-266, that the theme lacks.
/** Gap between the two stat tiles, prototype line 250 (`gap:8px`). */
const TILES_GAP = 8;
/** Gap between the mastery heading and its rows, prototype line 254 (`gap:10px`). */
const MASTERY_GAP = 10;
/**
 * The title's most lines. The design's title fits two lines at 50 points (README.md:146); a
 * longer count ("Twelve cards. Eighteen minutes.") is shrunk to fit them, down to this scale, so
 * the card's buttons stay on the card.
 */
const TITLE_LINES = 2;
const TITLE_MIN_SCALE = 0.6;

export type SummaryCardProps = {
  /** The set just finished: its topic (day, progress) and its Summary data. */
  set: FeedSet;
  /**
   * True while the Summary is the current page. Nothing here moves yet (the title, tiles and bars
   * are static), so it is not read; the Summary's motion will start from it.
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

/** "Mastery moved" and one row per moved node; nothing when no node moved. */
function MasteryList({ moved }: { moved: Summary['moved'] }) {
  if (moved.length === 0) return null;
  return (
    <View style={styles.mastery}>
      <Text style={styles.masteryHeading}>{copy.masteryMoved}</Text>
      {moved.map(([name, from, to], position) => (
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
 * reads them.
 */
export function SummaryCard({ set, onKeepGoing, onViewTree, nextSetStatus }: SummaryCardProps) {
  const totals = useFeedStore((state) => state.totals);
  const streak = useFeedStore((state) => state.streak);
  const { topic, summary } = set;

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
