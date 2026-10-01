import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import { colors, fonts } from '../theme';
import { BoldText } from './BoldText';
import { useCardTextColor } from './cardTextColor';

// Badge values from docs/design/card-feed/README.md:107-109 and, where it is silent, the prototype
// docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html:170-172. The theme holds none.
/** Size of the label and the message, prototype line 171 ("font-size:14px"). */
const TEXT_SIZE = 14;
/**
 * Line height of the label and the message: 14px at the prototype's body line height of 1.55,
 * rounded, docs/design/card-feed/reference/_ds/industry-be146a4e-adb2-4c13-8c51-8590a0cfc099/styles.css:108.
 */
const LINE_HEIGHT = 22;
/** Space between the label and the message, prototype line 171 ("gap:8px"). */
const GAP = 8;
/** The label's side padding, README.md:109 ("0/6 padding"). */
const LABEL_PADDING_X = 6;
/** The most lines an error message takes: page text can be long, and the card is fixed height. */
const ERROR_MAX_LINES = 3;

type Tone = 'pass' | 'warn' | 'error';

/**
 * The label's fill per tone: lime for a pass and yellow for a fail, README.md:107-108. The design
 * has no error badge; coral, the theme's warm alert color, marks one.
 */
const TONE_FILL: Record<Tone, string> = {
  pass: colors.lime,
  warn: colors.yellow,
  error: colors.coral,
};

type ResultBadgeProps = {
  /** `pass` and `warn` carry card text; `error` may carry text from the audio page. */
  tone: Tone;
  /** The badge itself, such as `Spec met`. One line; it never wraps. */
  label: string;
  /** Shown beside the label, wrapping as needed. Nothing is drawn for an empty message. */
  message: string;
};

/**
 * How the message is drawn, decided here by `tone` so no caller can choose. A `pass` or `warn`
 * message is trusted card text that may mark bold (rule SS-11), so it goes through `BoldText`. An
 * `error` message may be text the audio page sent, which is untrusted: it is one plain `Text`,
 * never parsed for markup, cut off with an ellipsis after 3 lines.
 */
function renderMessage(tone: Tone, message: string, style: StyleProp<TextStyle>) {
  if (tone === 'error') {
    return (
      <Text numberOfLines={ERROR_MAX_LINES} ellipsizeMode="tail" style={style}>
        {message}
      </Text>
    );
  }
  return <BoldText text={message} style={style} />;
}

/**
 * A result badge (README.md:107-109): a filled label in ink heading text, padded 0 and 6, that
 * never wraps or shrinks, with the message beside it in the card's text color. The row is a
 * polite live region, so a screen reader reads a new result on Android; iOS callers announce it.
 */
export function ResultBadge({ tone, label, message }: ResultBadgeProps) {
  const color = useCardTextColor();
  return (
    <View testID="result-badge" style={styles.row} accessibilityLiveRegion="polite">
      <Text
        testID="result-badge-label"
        numberOfLines={1}
        style={[styles.label, { backgroundColor: TONE_FILL[tone] }]}
      >
        {label}
      </Text>
      {message === '' ? null : (
        <View testID="result-badge-message" style={styles.messageBox}>
          {renderMessage(tone, message, [styles.message, { color }])}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP },
  label: {
    fontFamily: fonts.heading,
    fontSize: TEXT_SIZE,
    lineHeight: LINE_HEIGHT,
    color: colors.ink,
    paddingHorizontal: LABEL_PADDING_X,
    paddingVertical: 0,
    flexShrink: 0,
  },
  // The message takes the rest of the row and wraps inside it.
  messageBox: { flexShrink: 1 },
  message: { fontFamily: fonts.body, fontSize: TEXT_SIZE, lineHeight: LINE_HEIGHT },
});
