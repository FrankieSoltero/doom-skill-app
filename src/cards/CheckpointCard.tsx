import { useEffect, useRef } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import { announce } from '../components/announce';
import { CardFrame } from '../components/CardFrame';
import { useCardTextColor } from '../components/cardTextColor';
import { CodeEditor } from '../components/CodeEditor';
import { PrimaryButton } from '../components/PrimaryButton';
import { RubricList } from '../components/RubricList';
import { copy } from '../copy';
import type { CheckpointCard as CheckpointCardData } from '../data';
import type { CardAnswer } from '../feed/answers';
import { gradeCheckpoint } from '../feed/checkpoint';
import type { CheckpointGrade } from '../feed/checkpoint';
import { useFeedStore } from '../feed/store';
import { useCheckpointResult } from '../feed/useCheckpointResult';
import { cardTheme, colors, fonts } from '../theme';
import { cardMetaText, checkpointKickerText } from './cardLabels';
import { CardTitle } from './CardText';
import { CheckpointFeedback } from './CheckpointFeedback';
import { DismissKeyboardArea } from './DismissKeyboardArea';
import { useDismissKeyboardWhenLeft } from './useDismissKeyboardWhenLeft';

// Checkpoint card values from docs/design/card-feed/README.md:123-140 and, where it is silent, the
// prototype docs/design/card-feed/reference/DoomSkill Card Feed v2.dc.html:215-240. The theme holds
// none of them.
/** The editor's height, README.md:125 ("An ink TextInput, 104px"). */
const EDITOR_HEIGHT = 104;
/**
 * How long the demo grading takes, README.md:137 ("for 1.6s in the demo"). `motion` holds no such
 * timing: it stands in for the server call that will grade, not for an animation.
 */
const GRADING_DELAY = 1600;
/** The score line's size, README.md:139 ("in 22px heading"). */
const SCORE_SIZE = 22;
/** 22 at the prototype's inherited body line height of 1.55 (reference/_ds/.../styles.css:108). */
const SCORE_LINE_HEIGHT = 34;
/** The feedback's size, prototype line 235 (`font-size:13px`). */
const FEEDBACK_SIZE = 13;
/** 13 at the inherited line height of 1.55, rounded. */
const FEEDBACK_LINE_HEIGHT = 20;
/** Space between the score line and the feedback, prototype line 233 (`gap:2px`). */
const RESULT_GAP = 2;

type CheckpointAnswer = Extract<CardAnswer, { kind: 'checkpoint' }>;

/** The checkpoint answer in `answer`; null for no answer or an answer of another kind. */
function checkpointOf(answer: CardAnswer | undefined): CheckpointAnswer | null {
  return answer?.kind === 'checkpoint' ? answer : null;
}

/** The score line of a grade, README.md:139: `Passed · 3 of 4` or `Not yet · 1 of 4`. */
function scoreLine(grade: CheckpointGrade): string {
  const total = grade.results.length;
  return grade.passed
    ? copy.passedOf(grade.passCount, total)
    : copy.notYetOf(grade.passCount, total);
}

/** The feedback of a grade, written from the card's milestone, threshold and rubric size. */
function feedbackText(grade: CheckpointGrade, card: CheckpointCardData): string {
  const rows = card.rubric.length;
  if (grade.feedback === 'all') return copy.checkpoint.all(card.milestone, card.milestoneCount);
  if (grade.feedback === 'pass') return copy.checkpoint.pass(card.passThreshold, rows);
  return copy.checkpoint.fail(card.passThreshold, rows);
}

/** What the card tells the server's grade (src/feed/useCheckpointResult.ts). */
type ServerSubmit = { submit: (code: string, localPassed: boolean) => void; reset: () => void };

/**
 * The card's answer in the feed store at `index`, and the two ways to change it. `edit` stores the
 * code, idle, with no grade, and cancels a grading under way. `submit` dismisses the keyboard and
 * stores the code as it is in the store now, grading; `GRADING_DELAY` later it stores the grade of
 * that code, announces it and hands the code and its result to `server`, which posts it for a card
 * the API served. Both forget the server's last grade. The timer is cleared when the card is
 * removed. A card drawn over a stored `grading` has no timer to finish it, so it stores `idle`
 * once, on mount, keeping the code.
 */
function useCheckpointAnswer(card: CheckpointCardData, index: number, server: ServerSubmit) {
  const answer = useFeedStore((state) => checkpointOf(state.answers[index]));
  const setAnswer = useFeedStore((state) => state.setAnswer);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stored = checkpointOf(useFeedStore.getState().answers[index]);
    if (stored?.status === 'grading') setAnswer(index, { ...stored, status: 'idle' });
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [index, setAnswer]);

  const stopGrading = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const edit = (code: string) => {
    stopGrading();
    server.reset();
    setAnswer(index, { kind: 'checkpoint', code, status: 'idle', grade: null });
  };
  const submit = () => {
    // The keyboard would cover the rubric and the result.
    Keyboard.dismiss();
    // Read the store, not this render: an edit may land just before the press.
    const code = checkpointOf(useFeedStore.getState().answers[index])?.code ?? card.starterCode;
    stopGrading();
    server.reset();
    setAnswer(index, { kind: 'checkpoint', code, status: 'grading', grade: null });
    timer.current = setTimeout(() => {
      timer.current = null;
      const grade = gradeCheckpoint(code, card);
      setAnswer(index, { kind: 'checkpoint', code, status: 'done', grade });
      announce(copy.badgeSpoken(scoreLine(grade), feedbackText(grade, card)));
      server.submit(code, grade.passed);
    }, GRADING_DELAY);
  };

  const status = answer?.status ?? 'idle';
  const grade = status === 'done' ? (answer?.grade ?? null) : null;
  return { code: answer?.code ?? card.starterCode, status, grade, edit, submit };
}

type ButtonState = { label: string; disabled: boolean; finishes: boolean };

/**
 * The button for the card's state, README.md:135-140: Submit (enabled once there is code), then
 * Grading (disabled), then Finish today after a pass or Resubmit after a fail.
 */
function buttonState(
  status: CheckpointAnswer['status'],
  grade: CheckpointGrade | null,
  code: string,
): ButtonState {
  if (status === 'grading') return { label: copy.grading, disabled: true, finishes: false };
  if (grade?.passed === true) return { label: copy.finishToday, disabled: false, finishes: true };
  if (grade !== null) return { label: copy.resubmit, disabled: false, finishes: false };
  return { label: copy.submitForGrading, disabled: code.trim() === '', finishes: false };
}

/**
 * The score line and the feedback of a grade, README.md:139, in a polite live region that is
 * always there, so Android reads the grade when it appears. Nothing is drawn in it before a grade.
 */
function CheckpointResult({
  grade,
  card,
}: {
  grade: CheckpointGrade | null;
  card: CheckpointCardData;
}) {
  const color = useCardTextColor();
  return (
    <View testID="checkpoint-result" accessibilityLiveRegion="polite" style={styles.result}>
      {grade === null ? null : (
        <>
          <Text testID="checkpoint-score" style={[styles.score, { color }]}>
            {scoreLine(grade)}
          </Text>
          <Text testID="checkpoint-feedback" style={[styles.feedback, { color }]}>
            {feedbackText(grade, card)}
          </Text>
        </>
      )}
    </View>
  );
}

type CheckpointCardProps = {
  card: CheckpointCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** True while the card's page is the current one. Leaving it dismisses the keyboard. */
  active: boolean;
  /** Called when the learner presses Finish today, after a passing grade. */
  onNext: () => void;
};

/**
 * The checkpoint card (README.md:123-140), the last card of a set: kicker row, title, the code
 * editor on an ink panel, the rubric, the score line and feedback once graded, the server's grade
 * under them (`CheckpointFeedback`), a flex spacer, then one button whose label and action follow
 * the state.
 *
 * A tap on the card outside the editor and the button dismisses the keyboard.
 *
 * The answer lives in the feed store at `index` (see `useCheckpointAnswer`). Before the first edit
 * or submit there is none and the editor shows the starter code. The on-phone grade is the pure
 * `gradeCheckpoint` behind a 1,600 ms delay, and it alone decides the button: the card counts as
 * answered once graded, passed or not (`isAnswered`); only a pass offers Finish today. A card the
 * API served (it has an id) then posts the code, and the server's grade shows under the on-phone
 * one; it decides milestone progress on the server, not this card's button. It is polled only
 * while the card is `active` (src/feed/useCheckpointResult.ts). A demo card posts nothing.
 */
export function CheckpointCard({ card, index, active, onNext }: CheckpointCardProps) {
  const server = useCheckpointResult(card.id, active);
  const { code, status, grade, edit, submit } = useCheckpointAnswer(card, index, server);
  useDismissKeyboardWhenLeft(active);
  const button = buttonState(status, grade, code);
  const items =
    grade === null
      ? card.rubric.map(({ label }) => ({ label, passed: null }))
      : grade.results.map(({ label, passed }) => ({ label, passed }));

  return (
    <DismissKeyboardArea>
      <CardFrame
        type="checkpoint"
        kicker={checkpointKickerText(card)}
        meta={cardMetaText(card.estSeconds)}
      >
        <CardTitle size="s">{card.title}</CardTitle>
        <View testID="checkpoint-editor-panel" style={styles.panel}>
          <CodeEditor
            value={code}
            onChange={edit}
            caret={cardTheme.checkpoint.bg}
            height={EDITOR_HEIGHT}
          />
        </View>
        <RubricList items={items} />
        <CheckpointResult grade={grade} card={card} />
        <CheckpointFeedback result={server.result} localPassed={grade?.passed ?? null} />
        <View testID="checkpoint-spacer" style={styles.spacer} />
        <PrimaryButton
          label={button.label}
          onPress={button.finishes ? onNext : submit}
          disabled={button.disabled}
        />
      </CardFrame>
    </DismissKeyboardArea>
  );
}

const styles = StyleSheet.create({
  // The editor draws paper text on no ground of its own; this panel is its ink, README.md:125.
  panel: { backgroundColor: colors.ink },
  result: { gap: RESULT_GAP },
  score: { fontFamily: fonts.heading, fontSize: SCORE_SIZE, lineHeight: SCORE_LINE_HEIGHT },
  feedback: { fontFamily: fonts.body, fontSize: FEEDBACK_SIZE, lineHeight: FEEDBACK_LINE_HEIGHT },
  spacer: { flex: 1 },
});
