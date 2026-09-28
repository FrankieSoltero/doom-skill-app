import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FadedBorder } from '../components/FadedBorder';
import { ResultBadge } from '../components/ResultBadge';
import { copy } from '../copy';
import { STRUDEL_ERROR, type Strudel } from '../strudel/useStrudel';
import { colors, fonts } from '../theme';

// The design has no audio notices (docs/design/card-feed/README.md:86-112 simulates the audio).
// They reuse the result badge; the values below that the theme lacks are this card's own.
/** The most characters of page error text shown. */
const PAGE_TEXT_LIMIT = 200;
/** The smallest touch target, in points (global accessibility rule). */
const TOUCH_TARGET = 44;
/** Space between the badge and Reset, as between the badge's label and message (README.md:109). */
const GAP = 8;
/** Side padding of Reset. */
const RESET_PADDING_X = 12;
/** Size of Reset's label, as the badge's (prototype line 171, "font-size:14px"). */
const RESET_SIZE = 14;
/** Opacity of Reset's paper border, as Check's (README.md:105). */
const RESET_BORDER_OPACITY = 0.45;

/** The part of the player's state the notices read. */
export type AudioStatus = Pick<Strudel, 'status' | 'playing' | 'error' | 'needsNetwork'>;

type Notice = { tone: 'error' | 'warn'; label: string; message: string; resettable: boolean };

/**
 * The text of an audio error: the card's words for the hook's fixed keys, which are checked
 * first; any other error is page text, untrusted: every run of whitespace (newlines included)
 * becomes one space, then it is cut to its first 200 characters (whole characters, so a pair of
 * UTF-16 code units is never split). `ResultBadge` shows an error on at most 3 lines.
 */
function errorText(error: string): string {
  if (error === STRUDEL_ERROR.codeTooLong) return copy.codeTooLong;
  if (error === STRUDEL_ERROR.playerUnavailable) return copy.audioUnavailable;
  const oneLine = error.replace(/\s+/g, ' ').trim();
  return Array.from(oneLine).slice(0, PAGE_TEXT_LIMIT).join('');
}

/** The notice of a player that cannot play until it is reset. */
const UNAVAILABLE: Notice = {
  tone: 'error',
  label: copy.audioUnavailable,
  message: '',
  resettable: true,
};

/**
 * The one notice to show, by precedence: an error, then unavailable, then no connection. A page
 * that stopped answering is an error the card shows as unavailable.
 */
function noticeOf(audio: AudioStatus): Notice | null {
  if (audio.error === STRUDEL_ERROR.pageSilent) return UNAVAILABLE;
  if (audio.error !== null) {
    return {
      tone: 'error',
      label: copy.audioError,
      message: errorText(audio.error),
      resettable: true,
    };
  }
  if (audio.status === 'unavailable') return UNAVAILABLE;
  if (audio.needsNetwork && audio.playing) {
    return { tone: 'warn', label: copy.audioNeedsConnection, message: '', resettable: false };
  }
  return null;
}

/**
 * Which notice `AudioNotice` draws for `audio`, as a key that changes when the notice changes:
 * its label and message, or `null` for no notice. The exercise card shows one message at a time
 * and watches this key to tell when the audio state brings a new notice.
 */
export function noticeKey(audio: AudioStatus): string | null {
  const notice = noticeOf(audio);
  return notice === null ? null : `${notice.label}: ${notice.message}`;
}

/** The small action that loads a fresh player. */
function ResetButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copy.resetAudio}
      onPress={onPress}
      style={styles.reset}
    >
      <FadedBorder opacity={RESET_BORDER_OPACITY} />
      <Text style={styles.resetLabel}>{copy.resetAudio}</Text>
    </Pressable>
  );
}

type AudioNoticeProps = {
  audio: AudioStatus;
  /** Loads a fresh player and clears the error. */
  onReset: () => void;
};

/**
 * What the exercise card says about its audio, one notice at a time: an audio error (coral, the
 * text as plain text), else "Audio unavailable" (coral), else, while playing without samples,
 * "Audio needs a connection" (yellow). The first two carry a Reset action. Draws nothing when all
 * is well. It reads the card text color, so render it inside a `CardFrame`.
 */
export function AudioNotice({ audio, onReset }: AudioNoticeProps) {
  const notice = noticeOf(audio);
  if (notice === null) return null;
  return (
    <View testID="audio-notice" style={styles.row}>
      <View testID="audio-notice-badge" style={styles.badge}>
        <ResultBadge tone={notice.tone} label={notice.label} message={notice.message} />
      </View>
      {notice.resettable ? <ResetButton onPress={onReset} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  badge: { flex: 1 },
  reset: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: RESET_PADDING_X,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetLabel: { fontFamily: fonts.heading, fontSize: RESET_SIZE, color: colors.paper },
});
