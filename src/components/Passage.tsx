import { StyleSheet, Text, View } from 'react-native';

import { border, colors, space, type } from '../theme';

/** The width of the ink rule on the block's left. */
export const PASSAGE_RULE = border.strong;
/** The block's top and bottom padding. */
export const PASSAGE_PADDING_Y = space[3];
/** The block's left and right padding. */
export const PASSAGE_PADDING_X = space[4];

type PassageProps = {
  /** The passage, shown exactly as given. It is plain text: a `**` is drawn as typed. */
  text: string;
  /**
   * What a screen reader says instead of `text`, such as a cloze sentence with its blank spoken
   * as a word. Without it the passage is read as its text.
   */
  spokenLabel?: string;
};

/**
 * A short piece of prose on a paper ground with an ink rule on its left: a cloze sentence, a
 * scenario, or a quoted snippet, where a code card shows its code. The text wraps to the block's
 * width; nothing scrolls and no line is cut.
 */
export function Passage({ text, spokenLabel }: PassageProps) {
  return (
    <View testID="passage" style={styles.block}>
      <Text testID="passage-text" accessibilityLabel={spokenLabel} style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.paper,
    borderLeftWidth: PASSAGE_RULE,
    borderLeftColor: colors.ink,
    paddingVertical: PASSAGE_PADDING_Y,
    paddingHorizontal: PASSAGE_PADDING_X,
  },
  text: { ...type.body, color: colors.ink },
});
