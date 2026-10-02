import { Play, Square } from 'lucide-react-native';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CodeBlock } from '../components/CodeBlock';
import { copy } from '../copy';
import { colors, space } from '../theme';
import { AudioNotice, noticeKey } from './AudioNotice';
import { usePlayableCode, type PlayableCodeOptions } from './usePlayableCode';

// The design has no play control on a code block (docs/design/card-feed/README.md:21 draws the
// code alone). These values are this control's own; the theme holds none.
/** The control's width and height: the smallest touch target (global accessibility rule). */
const CONTROL_SIZE = 44;
/** Space between the code block and the control. */
const CONTROL_GAP = 8;
/** Icon size, as the exercise card's Play (README.md:104). */
const ICON_SIZE = 16;
/** Icon stroke width, README.md:22. */
const ICON_STROKE = 1.5;
/** Opacity of the control while it cannot play, as a disabled exercise button. */
const DISABLED_OPACITY = 0.45;

type PlayToggleProps = { playing: boolean; disabled: boolean; onPress: () => void };

/**
 * Play, or Stop while playing: a lime square with an ink `Play` or `Square` icon, labelled for a
 * screen reader with the exercise card's words.
 */
function PlayToggle({ playing, disabled, onPress }: PlayToggleProps) {
  const Icon = playing ? Square : Play;
  return (
    <Pressable
      testID="playable-code-control"
      accessibilityRole="button"
      accessibilityLabel={playing ? copy.stop : copy.play}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.control, disabled ? styles.disabled : null]}
    >
      <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} color={colors.ink} fill={colors.ink} />
    </Pressable>
  );
}

type PlayableCodeProps = PlayableCodeOptions & {
  /** A line shown after the code in the comment color. */
  comment?: string;
  /** Drawn under the code while the audio needs no attention; the audio notice takes its place. */
  children?: ReactNode;
};

/**
 * A code block that plays its Strudel code (M9 plan I Task 3): the code with Play / Stop on its
 * row, then `children`, or the audio notice in their place while the audio needs attention (an
 * error, a player that is unavailable, or samples that need the network), and the hidden player,
 * rendered once and never remounted. Play needs a ready player with no audio error; Stop always
 * works. The notice's Reset loads a fresh player and clears the error.
 */
export function PlayableCode({ comment, children, ...options }: PlayableCodeProps): ReactElement {
  const { strudel, playing, toggle } = usePlayableCode(options);
  const canPlay = strudel.status === 'ready' && strudel.error === null;
  const onReset = () => {
    strudel.reset();
    strudel.clearError();
  };

  return (
    <View testID="playable-code" style={styles.column}>
      <View testID="playable-code-row" style={styles.row}>
        <View style={styles.code}>
          <CodeBlock code={options.code} comment={comment ?? ''} />
        </View>
        <PlayToggle playing={playing} disabled={!playing && !canPlay} onPress={toggle} />
      </View>
      {noticeKey(strudel) === null ? children : <AudioNotice audio={strudel} onReset={onReset} />}
      {strudel.player}
    </View>
  );
}

const styles = StyleSheet.create({
  // The card body's gap (CardFrame), so the parts under the code sit as the card's own parts do.
  column: { gap: space[4] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: CONTROL_GAP },
  code: { flex: 1 },
  control: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
  },
  disabled: { opacity: DISABLED_OPACITY },
});
