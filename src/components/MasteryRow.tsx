import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { colors, type } from '../theme';
import { useCardTextColor } from './cardTextColor';

// Mastery row values from docs/design/card-feed/README.md:151 and the prototype,
// docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:257-259, which the theme lacks.
/** The bar's height, README.md:151 ("a 6px bar"). */
const BAR_HEIGHT = 6;
/** Gap between the text line and the bar, prototype line 257 (`gap:5px`). */
const ROW_GAP = 5;
/**
 * The track's opacity: the prototype fills it with the card's paper at 15%
 * (`color-mix(in srgb,var(--color-bg) 15%,transparent)`, line 259). The theme has no such color,
 * so the track is paper drawn at this opacity, under the fill.
 */
const TRACK_OPACITY = 0.15;

type MasteryRowProps = {
  /** The skill node's name, from the card data. */
  name: string;
  /** Mastery before this set, from 0 to 1. */
  from: number;
  /** Mastery after it, from 0 to 1. The bar is filled to this value. */
  to: number;
  /** The bar's fill, a theme color. */
  color: string;
};

/** A fraction limited to 0 to 1, as a whole percent. Anything that is not a number reads as 0. */
function wholePercent(fraction: number): number {
  const limited = Math.min(Math.max(fraction, 0), 1);
  return Number.isNaN(limited) ? 0 : Math.round(limited * 100);
}

/**
 * One row of the Summary's "Mastery moved" list (README.md:151): the node's name in the card's
 * text color and its change ("0.42 → 0.61") in neutral 400 on one line, over a 6-point bar filled
 * to the new value. The bar is static, at its final width. A screen reader hears the bar as a
 * progress bar named after the node, valued in percent.
 */
export function MasteryRow({ name, from, to, color }: MasteryRowProps) {
  const textColor = useCardTextColor();
  const percent = wholePercent(to);

  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <Text style={[styles.text, { color: textColor }]}>{name}</Text>
        <Text style={[styles.text, styles.delta]}>{copy.masteryDelta(from, to)}</Text>
      </View>
      <View
        testID="mastery-bar"
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={copy.masteryOf(name)}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={styles.bar}
      >
        <View testID="mastery-track" style={styles.track} />
        {/* The fill and the rest share the bar's width in the ratio percent : 100 - percent. */}
        <View testID="mastery-fill" style={{ flex: percent, backgroundColor: color }} />
        <View testID="mastery-rest" style={{ flex: 100 - percent }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: ROW_GAP },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  text: type.small,
  delta: { color: colors.neutral[400] },
  bar: { height: BAR_HEIGHT, flexDirection: 'row' },
  track: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.paper,
    opacity: TRACK_OPACITY,
  },
});
