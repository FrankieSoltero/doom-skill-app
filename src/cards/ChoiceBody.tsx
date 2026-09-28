import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

import { BoldText } from '../components/BoldText';
import { boldSegments } from '../components/boldSegments';
import { useCardTextColor } from '../components/cardTextColor';
import { OptionButton, optionState } from '../components/OptionButton';
import { copy } from '../copy';
import { type } from '../theme';

// Values from docs/design/card-feed/README.md:59-85 and, where it gives none, the prototype
// docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html that the theme does not hold.
/**
 * Space between options, in both layouts: the quiz stack's `gap:8px` (prototype line 106) and the
 * predict grid's `gap:8px` (line 130). The nearest theme steps, space[2] and space[3], are 6.8
 * and 10.2.
 */
const OPTION_GAP = 8;
/** Minimum height of a grid cell, README.md:79 ("62px minimum height"). */
const CELL_MIN_HEIGHT = 62;
/** Options per grid row, README.md:79 ("A 2×2 grid"). */
const GRID_COLUMNS = 2;
/** The explanation's size, README.md:73 ("Explanation (14px)"). The theme's body is 15. */
const EXPLANATION_SIZE = 14;
/** The explanation's line height: 14px at the prototype's body line height of 1.55, rounded. */
const EXPLANATION_LINE_HEIGHT = 22;

type ChoiceBodyProps = {
  /** The answers, in order. */
  options: string[];
  /** The index of the right answer. */
  correct: number;
  /** The index the learner picked, or null before an answer. */
  picked: number | null;
  /** Why the right answer is right. Bold-marked text (rule SS-11). */
  explanation: string;
  /** The correct option's text color: the card type's color. */
  accent: string;
  /** `stack`: one option under another (quiz). `grid`: two columns (predict). */
  layout: 'stack' | 'grid';
  /** Sets the option labels in the code font. */
  mono: boolean;
  /** Called with the index of a pressed option. Options lock once `picked` is set. */
  onPick: (index: number) => void;
};

/** Splits `items` into rows of `size`; the last row may be shorter. */
function rowsOf<Item>(items: readonly Item[], size: number): Item[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, row) =>
    items.slice(row * size, (row + 1) * size),
  );
}

/** What a screen reader hears for bold-marked `text`: the text with its markers removed. */
function spokenText(text: string): string {
  return boldSegments(text)
    .map((segment) => segment.text)
    .join('');
}

/**
 * Announces `message` on iOS when it changes from null to text after the first render: a
 * screen reader hears an explanation as it appears, not one already shown when the card was drawn.
 * Android hears it through the live region instead, so TalkBack does not read it twice.
 */
function useAnnounceOnAppear(message: string | null): void {
  const previous = useRef(message);
  useEffect(() => {
    const before = previous.current;
    previous.current = message;
    if (before === null && message !== null && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
}

/** The explanation, led by its verdict in bold, in the card's text color (README.md:73). */
function Explanation({ text }: { text: string }) {
  const color = useCardTextColor();
  return (
    <View testID="choice-explanation" accessibilityLiveRegion="polite">
      <BoldText text={text} style={[styles.explanation, { color }]} />
    </View>
  );
}

/**
 * The part the quiz and predict cards share (README.md:59-85): the options, then, once the
 * learner has picked, the explanation led by "Correct." or "Not quite.". Every option shows its
 * state from `optionState`. It renders two siblings, so the card's column gap spaces them. It
 * reads the card text color, so render it inside a `CardFrame`.
 */
export function ChoiceBody({
  options,
  correct,
  picked,
  explanation,
  accent,
  layout,
  mono,
  onPick,
}: ChoiceBodyProps) {
  const answered =
    picked === null
      ? null
      : copy.verdict(picked === correct ? copy.correct : copy.notQuite, explanation);
  useAnnounceOnAppear(answered === null ? null : spokenText(answered));

  const buttons = options.map((label, index) => (
    <OptionButton
      key={index}
      label={label}
      state={optionState(index, picked, correct)}
      accent={accent}
      mono={mono}
      picked={index === picked}
      onPress={() => {
        onPick(index);
      }}
    />
  ));

  return (
    <>
      <View testID="choice-options" style={styles.options}>
        {layout === 'stack' ? buttons : <Grid buttons={buttons} />}
      </View>
      {answered === null ? null : <Explanation text={answered} />}
    </>
  );
}

/**
 * The options in rows of two equal cells, each at least 62 tall; the button grows to fill its
 * cell. An odd last option sits beside an empty cell, so it keeps half the width.
 */
function Grid({ buttons }: { buttons: ReactElement[] }) {
  return rowsOf(buttons, GRID_COLUMNS).map((row, rowIndex) => (
    <View key={rowIndex} testID="choice-row" style={styles.row}>
      {row.map((button, cellIndex) => (
        <View key={cellIndex} testID="choice-cell" style={styles.cell}>
          {button}
        </View>
      ))}
      {row.length < GRID_COLUMNS ? (
        <View testID="choice-cell-empty" style={styles.emptyCell} />
      ) : null}
    </View>
  ));
}

const styles = StyleSheet.create({
  options: { gap: OPTION_GAP },
  row: { flexDirection: 'row', gap: OPTION_GAP },
  cell: { flex: 1, minHeight: CELL_MIN_HEIGHT },
  emptyCell: { flex: 1 },
  explanation: { ...type.body, fontSize: EXPLANATION_SIZE, lineHeight: EXPLANATION_LINE_HEIGHT },
});
