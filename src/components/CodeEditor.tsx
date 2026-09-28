import { useId } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { copy } from '../copy';
import { useFeedInputFocus } from '../feed/inputFocus';
import { MAX_CODE_LENGTH } from '../strudel/bridge';
import { border, colors, fonts, type } from '../theme';

// Editor values from docs/design/card-feed/README.md:90 and, where it is silent, the prototype
// docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:149. The theme holds none.
/** Top and bottom padding, prototype line 149 ("padding:12px 14px"). */
const PADDING_Y = 12;
/** Side padding, prototype line 149. */
const PADDING_X = 14;
// The Done bar is not in the design. Its values follow the exercise card's buttons.
/** The smallest touch target, in points (global accessibility rule). */
const TOUCH_TARGET = 44;
/** Side padding of Done. */
const DONE_PADDING_X = 16;
/** Size of Done's label, as the exercise buttons' (prototype lines 163 and 167). */
const DONE_SIZE = 17;

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
 * The bar iOS shows above this editor's keyboard: Done, which closes the keyboard. A multiline
 * input's return key types a newline, so without it the keyboard has no way to close.
 */
function DoneBar({ id }: { id: string }) {
  return (
    <InputAccessoryView nativeID={id}>
      <View testID="code-editor-accessory" style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.done}
          onPress={() => {
            Keyboard.dismiss();
          }}
          style={styles.done}
        >
          <Text style={styles.doneLabel}>{copy.done}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/**
 * A code editor for a REPL card (README.md:90): a multiline input in the theme's code style, paper
 * text on the card's ink ground, with the caret in `caret`. It types code, not prose: no
 * autocorrect, capitals, spell check, autofill or smart insert and delete (iOS). React Native 0.86
 * has no prop for iOS smart quotes and dashes; iOS leaves them off when autocorrect is off. It
 * takes at most `MAX_CODE_LENGTH` characters, the most the audio player accepts. While it has
 * focus, the feed pager's swipe is off (`useFeedInputFocus`). On iOS a Done key above the keyboard
 * closes it; each editor has its own bar, tied to it by an id.
 */
export function CodeEditor({ value, onChange, caret, height }: CodeEditorProps) {
  const { onFocus, onBlur } = useFeedInputFocus();
  const accessoryId = useId();
  const ios = Platform.OS === 'ios';
  return (
    <>
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
        {...(ios ? { inputAccessoryViewID: accessoryId } : {})}
        style={[styles.input, { height }]}
      />
      {ios ? <DoneBar id={accessoryId} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.code,
    color: colors.paper,
    paddingVertical: PADDING_Y,
    paddingHorizontal: PADDING_X,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: colors.paper,
    borderTopWidth: border.strong,
    borderTopColor: colors.ink,
  },
  done: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: DONE_PADDING_X,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: { fontFamily: fonts.heading, fontSize: DONE_SIZE, color: colors.ink },
});
