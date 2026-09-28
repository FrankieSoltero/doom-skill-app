import { Check, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableStateCallbackType, TextStyle, ViewStyle } from 'react-native';

import { copy } from '../copy';
import { border, colors, hardShadow, type } from '../theme';

// Answer option values from docs/design/card-feed/README.md (or, where it gives none, the
// prototype docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html) that the theme lacks.
/** Minimum height of a quiz option, README.md:61. Above the 44pt minimum touch target. */
const MIN_HEIGHT = 52;
/** Horizontal padding, README.md:61. */
const PADDING_X = 14;
/** Size of the mono label, README.md:61. The theme's code style is 14. */
const MONO_SIZE = 15;
/** Scale of the correct option, README.md:68. Static: decorative motion is later work. */
const CORRECT_SCALE = 1.02;
/** Opacity of the wrong pick's text and icon, "60% ink", README.md:69. */
const WRONG_OPACITY = 0.6;
/** Icon size. README.md:22 allows 16-22; the prototype's option icons are 18 (line 109). */
const ICON_SIZE = 18;
/** Icon stroke width, README.md:22. */
const ICON_STROKE = 1.5;
/** Gap between the label and the icon, from the prototype (line 108). */
const CONTENT_GAP = 10;
/**
 * How far an idle option moves right and down while pressed, dropping its shadow. README.md:18
 * says "1-2px"; the prototype's options use `translate(2px,2px)` (line 108).
 */
const PRESSED_OFFSET = 2;
// A compact option: Predict's grid cells. Prototype line 132 ("padding:8px 12px; font-size:14px",
// no icon markup, a plain button that centers its content) and screenshots/03-predict-answered.png
// (labels centered in their cells, no check or X icon).
/** Top and bottom padding of a compact option. */
const COMPACT_PADDING_Y = 8;
/** Left and right padding of a compact option. */
const COMPACT_PADDING_X = 12;

export type OptionState = 'idle' | 'correct' | 'wrong' | 'other';

/**
 * The state of option `index` once the learner has picked `picked` (null before an answer) in a
 * question whose right answer is `correct`.
 */
export function optionState(index: number, picked: number | null, correct: number): OptionState {
  if (picked === null) return 'idle';
  if (index === correct) return 'correct';
  return index === picked ? 'wrong' : 'other';
}

type Look = {
  fill: string;
  /** The label and icon color. */
  ink: string;
  /** Extra label styling: the wrong pick's dimming and strike-through. */
  text: TextStyle | null;
  icon: { Icon: LucideIcon; testID: string; opacity: number } | null;
  /** Extra styling of the whole button: the correct option's scale. */
  button: ViewStyle | null;
  /** The words a screen reader says for the option. */
  spoken: (label: string) => string;
};

/** Every state's look, README.md:66-71. Only `correct` reads the card's accent. */
function looks(accent: string): Record<OptionState, Look> {
  const same = (label: string) => label;
  return {
    idle: {
      fill: colors.paper,
      ink: colors.ink,
      text: null,
      icon: null,
      button: null,
      spoken: same,
    },
    correct: {
      fill: colors.ink,
      ink: accent,
      text: null,
      icon: { Icon: Check, testID: 'option-icon-correct', opacity: 1 },
      button: styles.correctButton,
      spoken: copy.optionCorrect,
    },
    wrong: {
      fill: 'transparent',
      ink: colors.ink,
      text: styles.wrongText,
      icon: { Icon: X, testID: 'option-icon-wrong', opacity: WRONG_OPACITY },
      button: null,
      spoken: copy.optionWrong,
    },
    other: {
      fill: 'transparent',
      ink: colors.ink,
      text: null,
      icon: null,
      button: null,
      spoken: same,
    },
  };
}

type OptionButtonProps = {
  /** The visible text. The spoken label adds the verdict once the question is answered. */
  label: string;
  state: OptionState;
  /** The correct option's text color: the card's own color (coral on Quiz, aqua on Predict). */
  accent: string;
  /** Sets the label in the code font, for options that are code. */
  mono?: boolean;
  /** Whether the learner picked this option; exposed as `accessibilityState.selected`. */
  picked?: boolean;
  /**
   * For a grid cell (Predict): the label centered, 8 and 12 padding, code at 14 (the theme's code
   * size) and no icon in any state. Fills, colors, spoken labels and states are unchanged.
   */
  compact?: boolean;
  /** Called on a press while idle. Every other state is locked. */
  onPress: () => void;
};

/**
 * An answer choice on the Quiz and Predict cards (README.md:61-71, 84). Idle, it is a paper box
 * with a 1.5pt ink border and a 3pt hard shadow drawn as a sibling view behind it. Once the
 * question is answered it locks, drops the shadow and shows its verdict. The button grows to fill
 * a taller container, so a card can set its height (62 on Predict) on a wrapping view.
 */
export function OptionButton({
  label,
  state,
  accent,
  mono = false,
  picked = false,
  compact = false,
  onPress,
}: OptionButtonProps) {
  const look = looks(accent)[state];
  const icon = compact ? null : look.icon;
  const idle = state === 'idle';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={look.spoken(label)}
      accessibilityState={{ disabled: !idle, selected: picked }}
      disabled={!idle}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        styles.button,
        look.button,
        pressed ? styles.pressed : null,
      ]}
    >
      {({ pressed }: PressableStateCallbackType) => (
        <>
          {idle && !pressed ? <View testID="option-shadow" style={styles.shadow} /> : null}
          <View
            testID="option-face"
            style={[
              styles.face,
              compact ? styles.compactFace : null,
              { backgroundColor: look.fill },
            ]}
          >
            <Text style={[labelStyle(mono, compact), { color: look.ink }, look.text]}>{label}</Text>
            {icon ? (
              <icon.Icon
                testID={icon.testID}
                size={ICON_SIZE}
                strokeWidth={ICON_STROKE}
                color={look.ink}
                opacity={icon.opacity}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

/** The label's style: code or body font, centered when compact. */
function labelStyle(mono: boolean, compact: boolean): TextStyle {
  if (compact) return mono ? styles.compactMono : styles.compactBody;
  return mono ? styles.mono : styles.body;
}

const styles = StyleSheet.create({
  button: { flexGrow: 1 },
  correctButton: { transform: [{ scale: CORRECT_SCALE }] },
  pressed: { transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }] },
  shadow: {
    position: 'absolute',
    top: hardShadow.option,
    left: hardShadow.option,
    right: -hardShadow.option,
    bottom: -hardShadow.option,
    backgroundColor: colors.ink,
  },
  face: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: CONTENT_GAP,
    minHeight: MIN_HEIGHT,
    paddingHorizontal: PADDING_X,
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  mono: { ...type.code, fontSize: MONO_SIZE, flexShrink: 1 },
  body: { ...type.body, flexShrink: 1 },
  compactFace: {
    justifyContent: 'center',
    paddingVertical: COMPACT_PADDING_Y,
    paddingHorizontal: COMPACT_PADDING_X,
  },
  compactMono: { ...type.code, flexShrink: 1, textAlign: 'center' },
  compactBody: { ...type.body, flexShrink: 1, textAlign: 'center' },
  wrongText: { opacity: WRONG_OPACITY, textDecorationLine: 'line-through' },
});
