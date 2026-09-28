import { StyleSheet, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import { fonts } from '../theme';
import { boldSegments } from './boldSegments';

type BoldTextProps = {
  /** The text to show. A pair of `**` markers makes the text between them bold. */
  text: string;
  /** The outer text's style. Every span inherits it; bold spans change only the font. */
  style?: StyleProp<TextStyle>;
};

/**
 * Body text with bold runs, as the design marks them (docs/design/card-feed/README.md:53, :73,
 * :118): one `Text` of nested spans, where text between a pair of `**` is drawn in the bold body
 * font and the markers are not shown. An unpaired `**` is shown as typed. There is no other
 * markup. The whole text reads as one element to a screen reader.
 */
export function BoldText({ text, style }: BoldTextProps) {
  return (
    <Text style={style}>
      {boldSegments(text).map((segment, index) => (
        <Text
          key={index}
          testID={segment.bold ? 'bold-span' : undefined}
          style={segment.bold ? styles.bold : undefined}
        >
          {segment.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontFamily: fonts.bodyBold },
});
