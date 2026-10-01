import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableStateCallbackType } from 'react-native';

import { colors, type } from '../theme';
import { CornerMarks } from './CornerMarks';

// Primary button values from docs/design/card-feed/README.md that the theme does not hold.
/** Height, README.md:49. Above the 44pt minimum touch target. */
export const BUTTON_HEIGHT = 50;
/**
 * How far the button moves right and down while pressed. README.md:18 says "1-2px" and gives no
 * number for the button; the prototype's primary buttons use `translate(1px,1px)`
 * (docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html:96).
 */
const PRESSED_OFFSET = 1;
/** Opacity of a disabled button, README.md:49. */
const DISABLED_OPACITY = 0.45;

type Variant = 'ink' | 'paper' | 'lime';

/**
 * Fill and label colors per variant, README.md:49: ink on light cards, paper on the exercise card,
 * lime on the summary. README.md:49 names no label color for lime; the prototype uses ink.
 */
const VARIANT_COLORS: Record<Variant, { fill: string; text: string }> = {
  ink: { fill: colors.ink, text: colors.paper },
  paper: { fill: colors.paper, text: colors.ink },
  lime: { fill: colors.lime, text: colors.ink },
};

type PrimaryButtonProps = {
  /** The visible text, also the accessibility label. */
  label: string;
  onPress: () => void;
  /** A disabled button is dimmed, ignores presses and reports itself disabled. */
  disabled?: boolean;
  variant?: Variant;
};

/**
 * The full-width call to action at the foot of a card: a filled 50pt box with "+" corner marks.
 * It has no hard shadow: README.md:18 lists the shadow owners and README.md:49 gives the primary
 * button none. While pressed it moves PRESSED_OFFSET right and down.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  variant = 'ink',
}: PrimaryButtonProps) {
  const { fill, text } = VARIANT_COLORS[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.button,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View testID="primary-button-face" style={[styles.face, { backgroundColor: fill }]}>
        <Text style={[styles.label, { color: text }]}>{label}</Text>
      </View>
      <CornerMarks />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'stretch', height: BUTTON_HEIGHT },
  disabled: { opacity: DISABLED_OPACITY },
  pressed: { transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }] },
  face: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: type.button,
});
