import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet } from 'react-native';

/**
 * Wraps an editor card so a tap anywhere on it outside the editor and the buttons dismisses the
 * keyboard, which blurs the editor and gives the pager its swipe back.
 *
 * - It is not an accessibility element, so screen readers reach its children as before, and it has
 *   no role, label or pressed look.
 * - React Native's responder system hands a touch to the deepest element that wants it, so a
 *   button or the text input (which claims its own touches to focus) wins over this area.
 * - The pager's pan is a Gesture Handler gesture, recognized natively beside this responder. A drag
 *   that starts here still pages when no input has focus; once the pan activates, the touch here is
 *   cancelled and no dismiss is sent. While an input has focus the pan is off, and a drag here that
 *   moves out of the press area ends without a dismiss.
 */
export function DismissKeyboardArea({ children }: { children: ReactNode }) {
  return (
    <Pressable
      testID="dismiss-keyboard-area"
      accessible={false}
      onPress={() => {
        Keyboard.dismiss();
      }}
      style={styles.area}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  area: { flex: 1 },
});
