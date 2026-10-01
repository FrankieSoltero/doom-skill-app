import { Play, Square } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PressableStateCallbackType, ViewStyle } from 'react-native';

import { FadedBorder } from '../components/FadedBorder';
import { copy } from '../copy';
import { colors, fonts } from '../theme';

// Exercise button values from docs/design/card-feed/README.md:103-105 and, where it is silent,
// the prototype docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html:162-168 and its
// button class (reference/_ds/industry-be146a4e-adb2-4c13-8c51-8590a0cfc099/styles.css:140-151).
// The theme holds none.
/** Height of each button, README.md:103 ("Two buttons, 46px"). Above the 44pt touch target. */
const BUTTON_HEIGHT = 46;
/** Space between the two buttons, prototype line 162 ("gap:8px"). */
const BUTTONS_GAP = 8;
/** Space between the icon and the label, styles.css:141 (`.btn` "gap: 6px"). */
const ICON_GAP = 6;
/** The label size, prototype lines 163 and 167 ("font-size:17px"). The theme's button is 18. */
const LABEL_SIZE = 17;
/** Icon size, prototype lines 164-165 (`width="16"`). */
const ICON_SIZE = 16;
/** Icon stroke width, README.md:22. */
const ICON_STROKE = 1.5;
/** Opacity of Check's paper border, README.md:105 ("paper at 45% opacity"). */
const CHECK_BORDER_OPACITY = 0.45;
/** Opacity of a disabled button, styles.css:151 (`.btn:disabled`). */
const DISABLED_OPACITY = 0.45;
/** How far a pressed button moves right and down, prototype lines 163 and 167. */
const PRESSED_OFFSET = 1;

/** The style of a button, pressed or not; `disabled` dims it. */
function buttonStyle(look: ViewStyle, disabled: boolean) {
  return ({ pressed }: PressableStateCallbackType) => [
    styles.button,
    look,
    disabled ? styles.disabled : null,
    pressed ? styles.pressed : null,
  ];
}

/** Play or Stop: given only for an exercise the app can play (Strudel). */
type PlayProps = {
  /** Shows Stop instead of Play. */
  playing: boolean;
  /** Whether Play may be pressed; Stop always may. */
  canPlay: boolean;
  onPlay: () => void;
  onStop: () => void;
};

/** No Play: an exercise in a language the app checks but cannot play (M6 hardening Task 8). */
type NoPlay = { [Name in keyof PlayProps]?: undefined };

type ExerciseControlsProps = { onCheck: () => void } & (PlayProps | NoPlay);

/** Play, or Stop while playing, in lime with ink text and a `Play` or `Square` icon. */
function PlayButton({ playing, canPlay, onPlay, onStop }: PlayProps) {
  const disabled = !playing && !canPlay;
  const label = playing ? copy.stop : copy.play;
  const Icon = playing ? Square : Play;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={playing ? onStop : onPlay}
      style={buttonStyle(styles.play, disabled)}
    >
      <Icon
        testID={playing ? 'stop-icon' : 'play-icon'}
        size={ICON_SIZE}
        strokeWidth={ICON_STROKE}
        color={colors.ink}
        fill={colors.ink}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text style={[styles.label, styles.playLabel]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The exercise card's buttons (README.md:103-105), side by side: Play, or Stop while playing (see
 * `PlayButton`); and Check, transparent with paper text and a paper border at 45%. Play is dimmed
 * and ignores presses unless `canPlay`. Without the Play props, Check stands alone across the row.
 */
export function ExerciseControls(props: ExerciseControlsProps) {
  return (
    <View testID="exercise-controls" style={styles.row}>
      {props.onPlay === undefined ? null : <PlayButton {...props} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.check}
        accessibilityState={{ disabled: false }}
        onPress={props.onCheck}
        style={buttonStyle(styles.check, false)}
      >
        <FadedBorder opacity={CHECK_BORDER_OPACITY} />
        <Text style={[styles.label, styles.checkLabel]}>{copy.check}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: BUTTONS_GAP },
  button: {
    flex: 1,
    height: BUTTON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ICON_GAP,
  },
  play: { backgroundColor: colors.lime },
  check: {},
  disabled: { opacity: DISABLED_OPACITY },
  pressed: { transform: [{ translateX: PRESSED_OFFSET }, { translateY: PRESSED_OFFSET }] },
  label: { fontFamily: fonts.heading, fontSize: LABEL_SIZE },
  playLabel: { color: colors.ink },
  checkLabel: { color: colors.paper },
});
