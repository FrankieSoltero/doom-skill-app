import { StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { border, colors } from '../theme';
import { useCardTextColor } from './cardTextColor';

// Registration marks, docs/design/card-feed/README.md:19. The theme holds none of these values.
/** Each mark is an 11 by 11 "+". */
const MARK_SIZE = 11;
/** Offset from the parent's edges that centres a mark on the corner. */
const MARK_OFFSET = -6;
/** The marks are drawn at 55% opacity. */
const MARK_OPACITY = 0.55;
/** Where each 1pt line sits inside its mark, so the two lines cross at the mark's centre. */
const LINE_INSET = (MARK_SIZE - border.hairline) / 2;

const CORNERS: readonly { name: string; position: ViewStyle }[] = [
  { name: 'top-left', position: { top: MARK_OFFSET, left: MARK_OFFSET } },
  { name: 'top-right', position: { top: MARK_OFFSET, right: MARK_OFFSET } },
  { name: 'bottom-left', position: { bottom: MARK_OFFSET, left: MARK_OFFSET } },
  { name: 'bottom-right', position: { bottom: MARK_OFFSET, right: MARK_OFFSET } },
];

/**
 * Whose color the marks take. `ink`: always ink, as README.md:19 draws every mark; the card frame
 * uses it, because its marks sit centred on the frame's corners, half over the paper page, so on
 * the ink-ground exercise and summary cards marks in the card text color (paper) could not be
 * seen. `cardText`: the card text color from `useCardTextColor`, the default, used by controls
 * inside a card.
 */
type Tone = 'ink' | 'cardText';

type CornerMarksProps = {
  /** Defaults to `cardText`. */
  tone?: Tone;
};

/**
 * Four "+" registration marks, one centred on each corner of the parent, which must be
 * positioned. The marks ignore touches and are hidden from assistive technology.
 *
 * The card frame's marks are ink on every card, as docs/design/card-feed/README.md:19 says.
 * Marks on a control inside a card (a button) take the card text color instead, a departure from
 * README.md:19, which draws them in ink everywhere: a control's marks sit over the card's own
 * ground, so on the ink-ground exercise and summary cards they show as paper, and on light cards
 * and outside any frame they stay ink. To restore the README for controls too, draw every mark
 * in `colors.ink`.
 */
export function CornerMarks({ tone = 'cardText' }: CornerMarksProps) {
  const cardTextColor = useCardTextColor();
  const lineColor = { backgroundColor: tone === 'ink' ? colors.ink : cardTextColor };

  return (
    <View
      testID="corner-marks"
      style={styles.layer}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {CORNERS.map(({ name, position }) => (
        <View key={name} testID="corner-mark" style={[styles.mark, position]}>
          <View testID="corner-mark-line" style={[styles.vertical, lineColor]} />
          <View testID="corner-mark-line" style={[styles.horizontal, lineColor]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: MARK_OPACITY },
  mark: { position: 'absolute', width: MARK_SIZE, height: MARK_SIZE },
  vertical: {
    position: 'absolute',
    left: LINE_INSET,
    top: 0,
    width: border.hairline,
    height: MARK_SIZE,
  },
  horizontal: {
    position: 'absolute',
    top: LINE_INSET,
    left: 0,
    width: MARK_SIZE,
    height: border.hairline,
  },
});
