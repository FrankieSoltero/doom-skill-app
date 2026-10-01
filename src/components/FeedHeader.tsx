import { Flame } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import type { FeedSet } from '../data';
import { border, colors, fonts, hardShadow, type } from '../theme';
import { doneCount, kickerText, segmentFills, streakCount } from './feedHeaderText';

// Feed header values from docs/design/card-feed/README.md:27-30 (or, where it gives none, the
// prototype docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html) that the theme lacks.
/** Header padding, top / sides / bottom, README.md:27 ("Padding is 6/18/12"). */
const HEADER_PADDING_TOP = 6;
const HEADER_PADDING_X = 18;
const HEADER_PADDING_BOTTOM = 12;
/** Gap between the title row and the progress bar, README.md:27 ("a 10px column gap"). */
const HEADER_GAP = 10;
/**
 * Text line height as a multiple of the font size. The prototype's header text inherits the
 * design system's `body { line-height: 1.55 }` (reference/_ds/.../styles.css:108); the title sets
 * its own (the theme's screenTitle).
 */
const INHERITED_LINE_HEIGHT = 1.55;
/** Streak chip padding, vertical / horizontal, README.md:29 ("4/10 padding"). */
const CHIP_PADDING_Y = 4;
const CHIP_PADDING_X = 10;
/** Gap between the flame and the count, from the prototype (`gap:4px`, line 61). */
const CHIP_GAP = 4;
/** The streak count's size, README.md:29 ("17px heading"). */
const COUNT_SIZE = 17;
/** Flame icon size, README.md:29. */
const ICON_SIZE = 16;
/** Icon stroke width, README.md:22. */
const ICON_STROKE = 1.5;
/** Progress segment height and the gap between segments, README.md:30. */
const SEGMENT_HEIGHT = 6;
const SEGMENT_GAP = 4;

type FeedHeaderProps = {
  /** The day's set: its topic names the kicker and its cards set the progress segments. */
  set: FeedSet;
  /** The pager page: a card's position in `set.cards`, or the card count on the Summary page. */
  index: number;
  /** Days in a row the learner has finished a set. Shown whole and never below 0. */
  streak: number;
};

/**
 * The top of the Today tab (docs/design/card-feed/README.md:27-30): the kicker and "Today" at the
 * left, the coral streak chip at the right, and below them one progress segment per card, filled
 * in the card's color up to the current card. The host screen pads for the top safe-area inset.
 */
export function FeedHeader({ set, index, streak }: FeedHeaderProps) {
  const total = set.cards.length;
  const done = doneCount(index, total);
  const days = streakCount(streak);

  return (
    <View testID="feed-header" style={styles.header}>
      <View style={styles.row}>
        <View>
          <Text style={styles.kicker}>{kickerText(set)}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.today}
          </Text>
        </View>
        <View testID="streak-chip" accessible accessibilityLabel={copy.streakLabel(days)}>
          <View testID="streak-chip-shadow" style={styles.chipShadow} />
          <View testID="streak-chip-face" style={styles.chipFace}>
            <Flame
              testID="streak-icon"
              size={ICON_SIZE}
              strokeWidth={ICON_STROKE}
              color={colors.ink}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
            <Text style={styles.count}>{days}</Text>
          </View>
        </View>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={copy.progressLabel(done, total)}
        accessibilityValue={{ min: 0, max: total, now: done }}
        style={styles.progress}
      >
        {segmentFills(set.cards, index).map((fill, position) => (
          <View
            // The segments are one per card, in order, and never reorder.
            key={position}
            testID="progress-segment"
            style={[styles.segment, { backgroundColor: fill }]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: HEADER_PADDING_TOP,
    paddingHorizontal: HEADER_PADDING_X,
    paddingBottom: HEADER_PADDING_BOTTOM,
    gap: HEADER_GAP,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // The prototype's header kicker has no weight of its own (line 58), so it is regular, not the
  // theme kicker's medium.
  kicker: {
    ...type.kicker,
    fontFamily: fonts.body,
    lineHeight: type.kicker.fontSize * INHERITED_LINE_HEIGHT,
    color: colors.neutral[700],
  },
  title: { ...type.screenTitle, color: colors.ink },
  chipShadow: {
    position: 'absolute',
    top: hardShadow.small,
    left: hardShadow.small,
    right: -hardShadow.small,
    bottom: -hardShadow.small,
    backgroundColor: colors.ink,
  },
  chipFace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CHIP_GAP,
    paddingVertical: CHIP_PADDING_Y,
    paddingHorizontal: CHIP_PADDING_X,
    borderWidth: border.strong,
    borderColor: colors.ink,
    backgroundColor: colors.coral,
  },
  count: {
    fontFamily: fonts.heading,
    fontSize: COUNT_SIZE,
    lineHeight: COUNT_SIZE * INHERITED_LINE_HEIGHT,
    color: colors.ink,
  },
  progress: { flexDirection: 'row', gap: SEGMENT_GAP },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    borderWidth: border.hairline,
    borderColor: colors.ink,
  },
});
