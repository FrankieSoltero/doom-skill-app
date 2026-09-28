import { StyleSheet, TextInput } from 'react-native';

import { copy } from '../copy';
import { useFeedInputFocus } from '../feed/inputFocus';
import { MAX_CODE_LENGTH } from '../strudel/bridge';
import { colors, type } from '../theme';

// Editor values from docs/design/card-feed/README.md:90 and, where it is silent, the prototype
// docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:149. The theme holds none.
/** Top and bottom padding, prototype line 149 ("padding:12px 14px"). */
const PADDING_Y = 12;
/** Side padding, prototype line 149. */
const PADDING_X = 14;

type CodeEditorProps = {
  /** The code shown. The editor is controlled: it shows this, whatever is typed. */
  value: string;
  /** Called with the whole new text after each edit. */
  onChange: (value: string) => void;
  /** The caret and selection color. */
  caret: string;
  /** The editor's height in points; longer code scrolls inside it. */
  height: number;
};

/**
 * A code editor for a REPL card (README.md:90): a multiline input in the theme's code style, paper
 * text on the card's ink ground, with the caret in `caret`. It types code, not prose: no
 * autocorrect, capitals, spell check, autofill or smart insert and delete (iOS). React Native 0.86
 * has no prop for iOS smart quotes and dashes; iOS leaves them off when autocorrect is off. It
 * takes at most `MAX_CODE_LENGTH` characters, the most the audio player accepts. While it has
 * focus, the feed pager's swipe is off (`useFeedInputFocus`).
 */
export function CodeEditor({ value, onChange, caret, height }: CodeEditorProps) {
  const { onFocus, onBlur } = useFeedInputFocus();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityLabel={copy.codeEditor}
      multiline
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      autoComplete="off"
      smartInsertDelete={false}
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
    ...type.code,
    color: colors.paper,
    paddingVertical: PADDING_Y,
    paddingHorizontal: PADDING_X,
  },
});
