import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableStateCallbackType } from 'react-native';

import { colors, hardShadow, type } from '../theme';
import { CornerMarks } from './CornerMarks';

// Primary button values from docs/design/card-feed/README.md that the theme does not hold.
/** Height, README.md:49. Above the 44pt minimum touch target. */
const BUTTON_HEIGHT = 50;
/** How far the button moves right and down while pressed, README.md:18 ("1-2px"). */
const PRESSED_OFFSET = 2;
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
 * The full-width call to action at the foot of a card: a filled 50pt box with a hard ink shadow
 * and "+" corner marks. While pressed it moves onto its shadow, and the shadow is not drawn.
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
      {({ pressed }: PressableStateCallbackType) => (
        <>
          {pressed ? null : <View testID="primary-button-shadow" style={styles.shadow} />}
          <View testID="primary-button-face" style={[styles.face, { backgroundColor: fill }]}>
            <Text style={[styles.label, { color: text }]}>{label}</Text>
          </View>
          <CornerMarks />
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'stretch', height: BUTTON_HEIGHT },
  disabled: { opacity: DISABLED_OPACITY },
  pressed: { transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }] },
  // README.md:49 gives no shadow for the primary button: the small hard shadow in ink, so a
  // press of PRESSED_OFFSET lands the button on it.
  shadow: {
    position: 'absolute',
    top: hardShadow.small,
    left: hardShadow.small,
    right: -hardShadow.small,
    bottom: -hardShadow.small,
    backgroundColor: colors.ink,
  },
  face: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: type.button,
});
