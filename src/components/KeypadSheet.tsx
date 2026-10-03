import { useMemo } from 'react';
import { Keyboard, PanResponder, StyleSheet, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';

import { copy } from '../copy';
import { useKeypad } from '../feed/keypad';
import { colors } from '../theme';
import { Keypad } from './Keypad';

// The keypad sheet's values (M9 plan K, P11; spec K6).
/** The sheet's height: shorter than the system keyboard's ~336. */
const SHEET_HEIGHT = 292;
/** Padding around the keypad. */
const PADDING = 12;
/** A release this far down, or more, hides the sheet. */
const SWIPE_HIDE = 40;
/**
 * How far a drag moves down before the sheet claims it. Below it a finger's jitter during a tap
 * stays with the key, which would otherwise lose its press to the sheet.
 */
const CLAIM_SLOP = 8;
/** The screen reader's escape gesture hides the sheet, as a swipe down does. */
const ESCAPE = [{ name: 'escape', label: copy.keypadHide }];

/**
 * Hides the sheet and closes the editor's keyboard. Hiding alone would leave the editor focused,
 * with no keyboard of either kind, the pager's swipe off, and a tap on it firing no focus to bring
 * the keypad back; the dismiss blurs it, and its blur hides its keypad too.
 */
function close() {
  useKeypad.getState().hide();
  Keyboard.dismiss();
}

/** The action key: the active editor passes it to its card (P16), then the sheet closes. */
function pressAction() {
  useKeypad.getState().press('action');
  close();
}

/** Closes the sheet on the screen reader's escape. */
function onAccessibilityAction({ nativeEvent }: AccessibilityActionEvent) {
  if (nativeEvent.actionName === 'escape') close();
}

/**
 * The code keypad's sheet (M9 plan K, P7 and P11): while an editor is active in the keypad store
 * (src/feed/keypad.ts), a 292 point ink panel with that editor's keypad; nothing otherwise. A
 * key press goes to the active editor, ABC hands over to the system keyboard, the action key goes
 * to the active editor and closes the sheet, and a swipe down of more than 40 points or a screen
 * reader's escape closes it. Closing also closes the editor's keyboard, which blurs it. The
 * parent places it at the screen's bottom. It is not modal: the card above it stays reachable.
 */
export function KeypadSheet() {
  const active = useKeypad((state) => state.active);
  const press = useKeypad((state) => state.press);
  const handOver = useKeypad((state) => state.useSystem);
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, { dx, dy }) =>
          dy > CLAIM_SLOP && Math.abs(dy) > Math.abs(dx),
        onPanResponderRelease: (_, { dy }) => {
          if (dy > SWIPE_HIDE) close();
        },
      }),
    [],
  );
  if (active === null) return null;
  return (
    <View
      testID="keypad-sheet"
      accessibilityViewIsModal={false}
      accessibilityActions={ESCAPE}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.sheet}
      {...swipe.panHandlers}
    >
      <Keypad keys={active.keys} onPress={press} onAbc={handOver} onAction={pressAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { height: SHEET_HEIGHT, backgroundColor: colors.ink, padding: PADDING },
});
