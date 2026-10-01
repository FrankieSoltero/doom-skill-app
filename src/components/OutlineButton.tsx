import { Pressable, StyleSheet, Text } from 'react-native';

import { border, type } from '../theme';
import { useCardTextColor } from './cardTextColor';

// Values equal to `PrimaryButton`'s, which exports its height and keeps the other two private;
// the theme has none of them.
/** Height, docs/design/card-feed/README.md:49. Above the 44pt minimum touch target. */
export const BUTTON_HEIGHT = 50;
/**
 * How far the button moves right and down while pressed, as `PrimaryButton` does: the prototype's
 * buttons use `translate(1px,1px)` (docs/design/card-feed/reference/DoomSkill Card Feed
 * v2.dc.html:96).
 */
const PRESSED_OFFSET = 1;
/** Opacity of a disabled button, README.md:49. */
const DISABLED_OPACITY = 0.45;

type OutlineButtonProps = {
  /** The visible text, also the accessibility label. */
  label: string;
  onPress: () => void;
  /** A disabled button is dimmed, ignores presses and reports itself disabled. */
  disabled?: boolean;
};

/** The button's style for its pressed and disabled states. */
function outlineStyle(pressed: boolean, disabled: boolean, color: string) {
  return [
    styles.button,
    { borderColor: color },
    pressed ? styles.pressed : null,
    disabled ? styles.disabled : null,
  ];
}

/**
 * A quieter full-width button beside a `PrimaryButton`: 50 points tall, transparent, with a
 * 1.5-point border and its label in the enclosing card frame's text color (paper on the Summary).
 * It has no corner marks, which README.md:17 gives to primary buttons. While pressed it moves one
 * point right and down.
 */
export function OutlineButton({ label, onPress, disabled = false }: OutlineButtonProps) {
  const color = useCardTextColor();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => outlineStyle(pressed, disabled, color)}
    >
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    height: BUTTON_HEIGHT,
    borderWidth: border.strong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }] },
  disabled: { opacity: DISABLED_OPACITY },
  label: type.button,
});
