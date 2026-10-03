import { StyleSheet, TextInput } from 'react-native';

import { copy } from '../copy';
import { MAX_CODE_LENGTH } from '../feed/checkpoint';
import { useFeedInputFocus } from '../feed/inputFocus';
import { colors, type } from '../theme';

// The written editor is not in the design. It takes the code editor's place and its padding
// (src/components/CodeEditor.tsx, from the prototype's line 149), in the body font.
/** Top and bottom padding, as the code editor's. */
const PADDING_Y = 12;
/** Side padding, as the code editor's. */
const PADDING_X = 14;

type WrittenEditorProps = {
  /** The answer shown. The editor is controlled: it shows this, whatever is typed. */
  value: string;
  /** Called with the whole new text after each edit. */
  onChange: (value: string) => void;
  /** The caret and selection color. */
  caret: string;
  /** The editor's height in points; a longer answer scrolls inside it. */
  height: number;
};

/**
 * The editor of a written checkpoint (M9 plan J): a multiline input in the body font, paper text
 * on the card's ink panel, labelled and with the placeholder "Your answer". It types prose, so the
 * keyboard's corrections stay on. It takes at most `MAX_CODE_LENGTH` characters, the most the
 * checkpoint sends. While it has focus, the feed pager's swipe is off (`useFeedInputFocus`). A tap
 * on the card outside it closes the keyboard (`DismissKeyboardArea`).
 */
export function WrittenEditor({ value, onChange, caret, height }: WrittenEditorProps) {
  const { onFocus, onBlur } = useFeedInputFocus();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityLabel={copy.yourAnswer}
      placeholder={copy.yourAnswer}
      placeholderTextColor={colors.neutral[400]}
      multiline
      textAlignVertical="top"
      scrollEnabled
      maxLength={MAX_CODE_LENGTH}
      cursorColor={caret}
      selectionColor={caret}
      style={[styles.input, { height }]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    color: colors.paper,
    paddingVertical: PADDING_Y,
    paddingHorizontal: PADDING_X,
  },
});
