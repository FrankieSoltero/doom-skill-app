import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BoldText } from '../components/BoldText';
import { CardFrame } from '../components/CardFrame';
import { streakCount } from '../components/feedHeaderText';
import { MasteryRow } from '../components/MasteryRow';
import { StatTile, TILE_PADDING_Y } from '../components/StatTile';
import { copy } from '../copy';
import type { FeedSet, Summary } from '../data';
import { outbox } from '../feed/outbox';
import { useFeedStore } from '../feed/store';
import type { NextSetStatus } from '../feed/useFeedSession';
import { useSummary } from '../feed/useSummary';
import { colors, type } from '../theme';
import { useTree } from '../topics/useTree';
import { SummaryActions } from './SummaryActions';
import { pointsGained, sectionLine, summaryTitle } from './summaryText';

// Summary values from docs/design/card-feed/README.md:143-153 and the prototype,
// docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html:243-265, that the theme lacks.
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
/** The points tile's inner padding left and right, as a stat tile's (prototype line 250). */
const TILE_PADDING_X = 12;
/**
 * The most lines of the points tile's section line ("Rhythm basics: 12 / 100 points"), which the
 * card's height budget counts (`__tests__/SummaryCard.height.test.ts`); a longer title is cut.
 */
export const SECTION_LINES = 2;

export type SummaryCardProps = {
  /** The set just finished: its topic (day, slug), its cards and its Summary data. */
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
 * The section line of the set's last card (`sectionLine`), from the topic's tree. While the
 * Summary is the current page and the outbox has sent every attempt, the tree is read, and asked
 * for again once (`refetchQueries`, joining a request already under way), so the section's points
 * include the set. `null` until then, and when the tree cannot be read.
 */
function useSectionLine(set: FeedSet, active: boolean): string | null {
  const cache = useQueryClient();
  const pending = useSyncExternalStore(outbox.subscribe, outbox.pending);
  const slug = active && pending === 0 ? set.topic.slug : null;
  const { tree } = useTree(slug);
  useEffect(() => {
    if (slug === null) return;
    void cache.refetchQueries({ queryKey: ['tree', slug], exact: true }, { cancelRefetch: false });
  }, [cache, slug]);
  return sectionLine(tree, set.cards);
}

/**
 * The Summary's second tile, on aqua as the design's progress tile: the points the set earned
 * ("+17 points", shrunk to one line) over the section line, left out when there is none.
 */
function PointsTile({ points, section }: { points: string; section: string | null }) {
  return (
    <View testID="points-tile" accessible style={styles.tile}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={TITLE_MIN_SCALE}
        style={styles.tileValue}
      >
        {points}
      </Text>
      {section === null ? null : (
        <Text numberOfLines={SECTION_LINES} style={styles.tileLabel}>
          {section}
        </Text>
      )}
    </View>
  );
}

/**
 * The last page of every set (docs/design/card-feed/README.md:143-153, spec section 1a): on the ink
 * card, the kicker "DAY 4 COMPLETE"; the title, counting every card and minute of the session so
 * far from the store's totals; the streak tile (coral) and the points tile (aqua): the points the
 * set earned (the store's `pointsEarned`, "+0 points" too) over the section line of the set's last
 * card (`useSectionLine`); the mastery rows; tomorrow's node and reminder (left out when none is
 * set); and the buttons. Everything is static: the title is lime, with no gradient, shine or
 * count-up, and the bars are drawn at their final values. The session adds the set to the totals
 * and raises the streak when this page is reached; this card only reads them. The mastery rows and
 * tomorrow come from the set's recorded summary once the store holds it (`useSummary`), else from
 * the projected one the set came with; so do the minutes to the next recall that the foot says
 * when no next set is open.
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
  const points = pointsGained(useFeedStore((state) => state.pointsEarned));
  useSummary(active);
  const section = useSectionLine(set, active);
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
        <PointsTile points={points} section={section} />
      </View>
      <MasteryList moved={summary.moved} />
      <View style={styles.fill} />
      <BoldText text={copy.tomorrow(summary.tomorrow, summary.reminder)} style={styles.footer} />
      <SummaryActions
        status={nextSetStatus}
        nextRecallMinutes={summary.nextRecallMinutes}
        onKeepGoing={onKeepGoing}
        onViewTree={onViewTree}
      />
    </CardFrame>
  );
}

const styles = StyleSheet.create({
  title: { ...type.summaryTitle, color: colors.lime },
  tiles: { flexDirection: 'row', gap: TILES_GAP },
  tile: {
    flex: 1,
    paddingVertical: TILE_PADDING_Y,
    paddingHorizontal: TILE_PADDING_X,
    backgroundColor: colors.aqua,
  },
  tileValue: { ...type.stat, color: colors.ink },
  tileLabel: { ...type.caption, color: colors.ink },
  mastery: { gap: MASTERY_GAP },
  masteryHeading: { ...type.caption, color: colors.neutral[400] },
  fill: { flex: 1 },
  footer: { ...type.small, color: colors.neutral[400] },
});
