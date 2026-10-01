import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, type } from '../theme';
import { tokenizeCode, type CodeToken } from './codeTokens';

// Code block values that docs/design/card-feed/README.md:21 leaves to the prototype and the
// theme does not hold, from reference/DoomSkill Card Feed v2.dc.html:83-85.
/** Inner padding, top and bottom ("padding:14px 16px"). The nearest theme step is 13.6. */
const PADDING_VERTICAL = 14;
/** Inner padding, left and right ("padding:14px 16px"). */
const PADDING_HORIZONTAL = 16;
/** The comment line's font size ("font-size:12px"). */
const COMMENT_FONT_SIZE = 12;
/** The comment line's height: 12px at the block's 1.6 line height, rounded as `type.code` is. */
const COMMENT_LINE_HEIGHT = 19;

type CodeBlockProps = {
  /** The code, shown exactly as given: line breaks kept, no line wrapped. */
  code: string;
  /** A line shown after the code in the comment color, as given. Empty renders nothing. */
  comment?: string;
};

/**
 * A Strudel snippet on an ink ground (docs/design/card-feed/README.md:21): paper text, known
 * function names lime, comments violet. The code is one selectable text of colored spans. A
 * line wider than the block scrolls sideways; the scroll view is horizontal only, so a vertical
 * swipe still reaches the pager.
 */
export function CodeBlock({ code, comment }: CodeBlockProps) {
  return (
    <ScrollView
      testID="code-block"
      style={styles.block}
      horizontal
      directionalLockEnabled
      alwaysBounceVertical={false}
    >
      <View testID="code-block-content" style={styles.content}>
        <Text testID="code-block-code" style={styles.code} selectable>
          {tokenizeCode(code).map((token, index) => (
            <Text key={index} testID={`code-token-${token.kind}`} style={tokenStyles[token.kind]}>
              {token.text}
            </Text>
          ))}
        </Text>
        {comment ? (
          <Text testID="code-block-comment" style={styles.comment} selectable>
            {comment}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A horizontal ScrollView grows to fill its parent by default; the block keeps to its content.
  block: { flexGrow: 0, backgroundColor: colors.ink },
  content: { paddingVertical: PADDING_VERTICAL, paddingHorizontal: PADDING_HORIZONTAL },
  code: { ...type.code, color: colors.paper },
  comment: {
    ...type.code,
    fontSize: COMMENT_FONT_SIZE,
    lineHeight: COMMENT_LINE_HEIGHT,
    color: colors.violet,
  },
});

const tokenStyles: Record<CodeToken['kind'], { color: string }> = StyleSheet.create({
  fn: { color: colors.lime },
  comment: { color: colors.violet },
  plain: { color: colors.paper },
});
