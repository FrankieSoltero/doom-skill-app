import { StyleSheet, View } from 'react-native';

import { border, colors } from '../theme';

// Values from docs/design/card-feed/README.md:159 ("a 6px bordered mastery bar", in a 64px
// column), which the theme lacks.
/** The bar's height. */
const BAR_HEIGHT = 6;
/** The bar's width: the node row's middle column. */
const BAR_WIDTH = 64;

type MasteryBarProps = {
  /** Mastery from 0 to 1; anything outside is limited to it, and anything not a number reads 0. */
  value: number;
  /** A locked node's bar has no fill and a neutral border. */
  locked: boolean;
  /** The fill, a theme color: the node's milestone color. */
  color: string;
};

/** `fraction` limited to 0 to 1, as a whole percent; anything not a number reads as 0. */
export function wholePercent(fraction: number): number {
  const limited = Math.min(Math.max(fraction, 0), 1);
  return Number.isNaN(limited) ? 0 : Math.round(limited * 100);
}

/**
 * A skill tree node's mastery (README.md:159): a 6-point bar with a 1-point ink border, filled in
 * the milestone's color to the value. It draws only; the node's row tells a screen reader the
 * value.
 */
export function MasteryBar({ value, locked, color }: MasteryBarProps) {
  const percent = wholePercent(value);

  return (
    <View testID="mastery-bar" style={[styles.bar, locked ? styles.locked : null]}>
      {locked ? null : (
        <>
          {/* The fill and the rest share the bar's width in the ratio percent : 100 - percent. */}
          <View testID="mastery-bar-fill" style={{ flex: percent, backgroundColor: color }} />
          <View testID="mastery-bar-rest" style={{ flex: 100 - percent }} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    borderWidth: border.hairline,
    borderColor: colors.ink,
  },
  locked: { borderColor: colors.neutral[400] },
});
