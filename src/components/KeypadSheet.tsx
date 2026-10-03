import { useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { useKeypad } from '../feed/keypad';
import { colors } from '../theme';
import { Keypad } from './Keypad';

// The keypad sheet's values (M9 plan K, P11; spec K6).
/** The sheet's height: shorter than the system keyboard's ~336. */
const SHEET_HEIGHT = 292;
/** Padding around the keypad. */
const PADDING = 12;
/** Gap between the sheet's rows. */
const GAP = 8;
/** A release this far down, or more, hides the sheet. */
const SWIPE_HIDE = 40;
/**
 * How far a drag moves down before the sheet claims it. Below it a finger's jitter during a tap
 * stays with the key, which would otherwise lose its press to the sheet.
 */
const CLAIM_SLOP = 8;

/**
 * The code keypad's sheet (M9 plan K, P7 and P11): while an editor is active in the keypad store
 * (src/feed/keypad.ts), a 292 point ink panel with that editor's keypad; nothing otherwise. A
 * key press goes to the active editor, ABC hands over to the system keyboard, the action key and
 * a swipe down of more than 40 points hide the sheet. The parent places it at the screen's
 * bottom. It is not modal: the card above it stays reachable.
 */
export function KeypadSheet() {
  const active = useKeypad((state) => state.active);
  const press = useKeypad((state) => state.press);
  const handOver = useKeypad((state) => state.useSystem);
  const hide = useKeypad((state) => state.hide);
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, { dx, dy }) =>
          dy > CLAIM_SLOP && Math.abs(dy) > Math.abs(dx),
        onPanResponderRelease: (_, { dy }) => {
          if (dy > SWIPE_HIDE) useKeypad.getState().hide();
        },
      }),
    [],
  );
  if (active === null) return null;
  return (
    <View
      testID="keypad-sheet"
      accessibilityViewIsModal={false}
      style={styles.sheet}
      {...swipe.panHandlers}
    >
      <Keypad keys={active.keys} onPress={press} onAbc={handOver} onAction={hide} />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { height: SHEET_HEIGHT, backgroundColor: colors.ink, padding: PADDING, gap: GAP },
});
