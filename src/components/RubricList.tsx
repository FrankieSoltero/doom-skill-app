import { Check } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import { border, cardTheme, fonts } from '../theme';

// Rubric values from docs/design/card-feed/README.md:130 and :138 and, where it is silent, the
// prototype docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html:222-229. The theme holds
// none of them.
/** The label's size, README.md:130 ("Each row is 13.5px"). */
const LABEL_SIZE = 13.5;
/** 13.5 at the prototype's inherited body line height of 1.55 (reference/_ds/.../styles.css:108). */
const LABEL_LINE_HEIGHT = 21;
/** The checkbox's side, README.md:130 ("an 18px checkbox"). */
const BOX_SIZE = 18;
/** The check inside a passed box, prototype line 226 (`width="12" height="12"`). */
const CHECK_SIZE = 12;
/**
 * The check's stroke, README.md:22 (`strokeWidth={1.5}`), drawn without scaling, so it stays 1.5
 * points at 12 points: the prototype's `stroke-width="3"` in a 24 box drawn at 12 (line 226).
 */
const CHECK_STROKE = 1.5;
/** Space between the box and the label, prototype line 224 (`gap:10px`). */
const ROW_GAP = 10;
/** Top and bottom padding of a row, prototype line 224 (`padding:6px 0`). */
const ROW_PADDING_Y = 6;
/** Opacity of the line under each row, prototype line 224 (ink at 30%, `color-mix`). */
const ROW_LINE_OPACITY = 0.3;

/** The rubric list sits only on the checkpoint card, so it takes that card's colors. */
const { fg: INK, bg: ACCENT } = cardTheme.checkpoint;

type RubricItem = {
  label: string;
  /** Whether the item was met; null before a grade. */
  passed: boolean | null;
};

type RubricListProps = { items: RubricItem[] };

/** The spoken state of an item: passed, not met, or not graded yet. */
function spokenState(passed: boolean | null): 'passed' | 'failed' | 'notGraded' {
  if (passed === null) return 'notGraded';
  return passed ? 'passed' : 'failed';
}

/** One rubric row: the box, filled ink with a pink check when passed, then the label. */
function RubricRow({ label, passed }: RubricItem) {
  return (
    <View
      testID="rubric-row"
      accessible
      accessibilityRole="checkbox"
      accessibilityState={{ checked: passed === true, disabled: true }}
      accessibilityLabel={copy.rubricItem(label, spokenState(passed))}
      style={styles.row}
    >
      <View testID="rubric-box" style={[styles.box, passed === true ? styles.filled : null]}>
        {passed === true ? (
          <Check
            testID="rubric-check"
            size={CHECK_SIZE}
            strokeWidth={CHECK_STROKE}
            nonScalingStroke
            color={ACCENT}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
      </View>
      <Text style={[styles.label, passed === false ? styles.struck : null]}>{label}</Text>
    </View>
  );
}

/**
 * The checkpoint card's rubric (README.md:130-134, :138), under a 1.5pt ink rule: one row per item,
 * each over a 1pt ink line at 30%. Before a grade every box is empty. After one, a passed item's
 * box is filled ink with a pink check, and a failed item's label is struck through. The filled box
 * is static: the pop is decorative motion, left for later work. Each row is one checkbox to a
 * screen reader, checked when passed and disabled, since the learner cannot toggle it.
 */
export function RubricList({ items }: RubricListProps) {
  return (
    <View testID="rubric-list" style={styles.list}>
      {items.map((item, index) => (
        <View key={`${String(index)}:${item.label}`}>
          <RubricRow label={item.label} passed={item.passed} />
          <View testID="rubric-line" style={styles.line} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: border.strong, borderTopColor: INK },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingVertical: ROW_PADDING_Y,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderWidth: border.strong,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { backgroundColor: INK },
  label: {
    flexShrink: 1,
    fontFamily: fonts.body,
    fontSize: LABEL_SIZE,
    lineHeight: LABEL_LINE_HEIGHT,
    color: INK,
  },
  struck: { textDecorationLine: 'line-through' },
  line: { height: border.hairline, backgroundColor: INK, opacity: ROW_LINE_OPACITY },
});
