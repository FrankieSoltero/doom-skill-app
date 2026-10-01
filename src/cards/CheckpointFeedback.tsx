import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { useCardTextColor } from '../components/cardTextColor';
import { copy } from '../copy';
import type { ServerResult } from '../feed/useCheckpointResult';
import { fonts, space, type } from '../theme';

/**
 * The tallest the server's feedback grows before it scrolls: six lines of small text. On a card
 * with less room left it shrinks further (`flexShrink`), so the button under it stays on the card.
 */
const MAX_HEIGHT = 6 * type.small.lineHeight;
/** The most lines the server's feedback takes; the rest is cut with an ellipsis. */
const FEEDBACK_LINES = 8;
/** The most lines a criterion's sentence takes. */
const JUSTIFICATION_LINES = 4;
/** The most lines of a short text: a status line, the verdict, a criterion's name. */
const SHORT_LINES = 2;
/** The status lines are quieter than the grade, as the rubric's row lines are (RubricList). */
const QUIET_OPACITY = 0.7;

type ServerGrade = Extract<ServerResult, { status: 'graded' }>['grade'];

/** A fraction from 0 to 1 as a whole percent. */
function percentOf(fraction: number): number {
  return Math.round(fraction * 100);
}

function verdictOf(grade: ServerGrade): string {
  return copy.checkpoint.detailVerdict(
    grade.passed === true,
    grade.score === null ? null : percentOf(grade.score),
  );
}

/** The server's grade as text: its verdict, feedback and criteria. Server text is never markup. */
function GradeText({ grade, localPassed }: { grade: ServerGrade; localPassed: boolean | null }) {
  const color = useCardTextColor();
  const text = [styles.text, { color }];
  const differs = localPassed !== null && grade.passed !== null && grade.passed !== localPassed;
  return (
    <>
      <Text numberOfLines={SHORT_LINES} style={[text, styles.verdict]}>
        {verdictOf(grade)}
      </Text>
      {grade.feedback === null ? null : (
        <Text numberOfLines={FEEDBACK_LINES} style={text}>
          {grade.feedback}
        </Text>
      )}
      {(grade.criteria ?? []).map((criterion, index) => (
        <View key={`${String(index)}:${criterion.name}`}>
          <Text numberOfLines={SHORT_LINES} style={[text, styles.verdict]}>
            {copy.checkpoint.detailCriterion(criterion.name, percentOf(criterion.score))}
          </Text>
          <Text numberOfLines={JUSTIFICATION_LINES} style={text}>
            {criterion.justification}
          </Text>
        </View>
      ))}
      {differs ? (
        <Text numberOfLines={SHORT_LINES} style={text}>
          {copy.checkpoint.detailDecides}
        </Text>
      ) : null}
    </>
  );
}

/** The status line of a result that is not graded. */
function statusLabel(result: ServerResult): string {
  return result.status === 'pending'
    ? copy.checkpoint.detailPending
    : copy.checkpoint.detailUnavailable;
}

/** One quiet status line: pending or unavailable. */
function StatusLine({ label }: { label: string }) {
  const color = useCardTextColor();
  return (
    <Text numberOfLines={SHORT_LINES} style={[styles.text, styles.quiet, { color }]}>
      {label}
    </Text>
  );
}

type CheckpointFeedbackProps = {
  /** The server's grade of the last submission (src/feed/useCheckpointResult.ts). */
  result: ServerResult;
  /** The on-phone result of the same code: whether it passed; `null` before it shows. */
  localPassed: boolean | null;
};

/**
 * The server's grade under the checkpoint card's on-phone result (M5): a quiet line while it is
 * pending, one fixed line when it will not come, then the verdict, the feedback and each
 * criterion's score and sentence. When the two results differ it says the detailed grade decides
 * progress; the on-phone result still decides the card's button. Nothing is drawn before a
 * submission.
 *
 * It all sits in a scroll area of bounded height that may shrink but never grow, so a long grade
 * scrolls inside the card and never pushes the button off it. Every server string is drawn as
 * plain text, its lines bounded. The verdict is announced when it arrives.
 */
export function CheckpointFeedback({ result, localPassed }: CheckpointFeedbackProps) {
  const verdict = result.status === 'graded' ? verdictOf(result.grade) : null;
  useEffect(() => {
    if (verdict !== null) announce(verdict);
  }, [verdict]);

  if (result.status === 'none') return null;
  return (
    <ScrollView
      testID="checkpoint-detail"
      accessibilityLiveRegion="polite"
      style={styles.area}
      contentContainerStyle={styles.content}
    >
      {result.status === 'graded' ? (
        <GradeText grade={result.grade} localPassed={localPassed} />
      ) : (
        <StatusLine label={statusLabel(result)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  area: { flexGrow: 0, flexShrink: 1, maxHeight: MAX_HEIGHT },
  content: { gap: space[1] },
  text: type.small,
  verdict: { fontFamily: fonts.bodyBold },
  quiet: { opacity: QUIET_OPACITY },
});
