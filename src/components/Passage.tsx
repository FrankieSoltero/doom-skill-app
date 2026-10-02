import { StyleSheet, Text, View } from 'react-native';

import { border, colors, space, type } from '../theme';

type PassageProps = {
  /** The passage, shown exactly as given. It is plain text: a `**` is drawn as typed. */
  text: string;
};

/**
 * A short piece of prose on a paper ground with an ink rule on its left: a cloze sentence, a
 * scenario, or a quoted snippet, where a code card shows its code. The text wraps to the block's
 * width; nothing scrolls and no line is cut.
 */
export function Passage({ text }: PassageProps) {
  return (
    <View testID="passage" style={styles.block}>
      <Text testID="passage-text" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.paper,
    borderLeftWidth: border.strong,
    borderLeftColor: colors.ink,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
  text: { ...type.body, color: colors.ink },
});
