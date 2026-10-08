/**
 * One answer under a question in the Questions tab (M10 plan Q Task 12, spec 3.4; D16): its author
 * and text, the hidden line on the learner's own hidden answer, the "Accepted" label, the helpful
 * count from 1, and the controls the learner may use on it.
 *
 * - **Accept**: on the learner's own question while it is open with no accepted answer, on
 *   another's answer.
 * - **Helpful**: on another's answer; disabled once the learner found it helpful.
 * - **Flag**: on another's answer; one tap sends the reason `other`, then "Flagged" stands in.
 * - **Delete**: on the learner's own answer, in two taps (decision Q13).
 *
 * Each sent action marks the inbox and the card's questions stale, so the read that follows shows
 * its result (`useQaAction`). A refused one shows its line under the row. The small controls and
 * the lines are shared with the question's own Flag and Delete (`QuestionCard`).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { requireApi } from '../api/query';
import { copy } from '../copy';
import {
  acceptAnswer,
  deleteAnswer,
  flagAnswer,
  markHelpful,
  type Answer,
  type Question,
} from '../data/qa';
import { border, colors, space, type } from '../theme';
import {
  questionKeys,
  useQaAction,
  useTwoTapAction,
  type QaAction,
  type QaActionOutcome,
  type TwoTapAction,
} from './useQaAction';

/** Grows a control's touch target towards 44 points around its small label. */
const HIT_SLOP = 8;

/**
 * The name shown for the author of a question or an answer: You, their name, or A learner; then
 * their level from Level 2 (" · Level 2", L15).
 */
export function byline(item: Question | Answer): string {
  const name = item.mine ? copy.qa.you : (item.author.name ?? copy.qa.aLearner);
  return item.author.level > 1 ? name + copy.levels.byline(item.author.level) : name;
}

/** The "hidden pending review" line, for an item that flags hid; nothing otherwise. */
export function HiddenLine({ status }: { status: string }) {
  if (status !== 'hidden') return null;
  return <Text style={styles.quiet}>{copy.qa.hiddenPending}</Text>;
}

type QaControlProps = { label: string; onPress: () => void; disabled?: boolean };

/** A small outlined control in a question's or an answer's row of controls. */
function QaControl({ label, onPress, disabled = false }: QaControlProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={[styles.control, disabled ? styles.disabled : null]}
    >
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

/** The line a refused action shows, or null for none. */
function outcomeLine(outcome: QaActionOutcome | null): string | null {
  switch (outcome) {
    case null:
    case 'ok':
      return null;
    case 'notAllowed':
      return copy.qa.notAllowed;
    case 'conflict':
      return copy.qa.conflict;
    default:
      return copy.qa.failed;
  }
}

/** The lines of the refused actions among `outcomes`, each line once. */
export function OutcomeLines({ outcomes }: { outcomes: (QaActionOutcome | null)[] }) {
  const lines = [...new Set(outcomes.map(outcomeLine))].filter((line) => line !== null);
  if (lines.length === 0) return null;
  return (
    <View accessibilityLiveRegion="polite">
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

type FlagOrDeleteProps = { mine: boolean; flag: QaAction; remove: TwoTapAction };

/** Delete in two taps on the learner's own item; on another's, Flag, then "Flagged" once sent. */
export function FlagOrDelete({ mine, flag, remove }: FlagOrDeleteProps) {
  if (mine) {
    return (
      <QaControl
        label={remove.armed ? copy.qa.removeAgain : copy.qa.remove}
        onPress={remove.run}
        disabled={remove.busy}
      />
    );
  }
  if (flag.outcome === 'ok') return <Text style={styles.quiet}>{copy.qa.flagged}</Text>;
  return <QaControl label={copy.qa.flag} onPress={flag.run} disabled={flag.busy} />;
}

type AnswerRowProps = { answer: Answer; question: Question };

/** The answer's controls (module comment) and their lines. */
function AnswerControls({ answer, question }: AnswerRowProps) {
  const keys = questionKeys(question);
  const accept = useQaAction(() => acceptAnswer(requireApi(), question.id, answer.id), keys);
  const helpful = useQaAction(() => markHelpful(requireApi(), answer.id), keys);
  const flag = useQaAction(() => flagAnswer(requireApi(), answer.id, 'other'), keys);
  const remove = useTwoTapAction(() => deleteAnswer(requireApi(), answer.id), keys);
  const acceptable =
    question.mine &&
    question.status === 'open' &&
    question.acceptedAnswerId === null &&
    !answer.mine;
  return (
    <>
      <View style={styles.controls}>
        {acceptable ? (
          <QaControl
            label={copy.qa.accept}
            onPress={accept.run}
            disabled={accept.busy || accept.outcome === 'ok'}
          />
        ) : null}
        {answer.mine ? null : (
          <QaControl
            label={copy.qa.helpful}
            onPress={helpful.run}
            disabled={answer.helpfulByMe || helpful.busy || helpful.outcome === 'ok'}
          />
        )}
        <FlagOrDelete mine={answer.mine} flag={flag} remove={remove} />
      </View>
      <OutcomeLines outcomes={[accept.outcome, helpful.outcome, flag.outcome, remove.outcome]} />
    </>
  );
}

/** The row (module comment). */
export function AnswerRow({ answer, question }: AnswerRowProps) {
  return (
    <View style={styles.answer}>
      <Text style={styles.author}>{byline(answer)}</Text>
      <Text style={styles.text}>{answer.text}</Text>
      <HiddenLine status={answer.status} />
      {answer.accepted ? <Text style={styles.author}>{copy.qa.accepted}</Text> : null}
      {answer.helpfulCount > 0 ? (
        <Text style={styles.quiet}>{copy.qa.helpfulCount(answer.helpfulCount)}</Text>
      ) : null}
      <AnswerControls answer={answer} question={question} />
    </View>
  );
}

const styles = StyleSheet.create({
  // An answer sits under its question, set in from the left, as in the ask sheet's list.
  answer: { gap: space[1], paddingLeft: space[4] },
  author: { ...type.kicker, color: colors.ink },
  text: { ...type.body, color: colors.ink },
  // The project has no muted text token: the ink at 60% opacity, as the ask sheet's hidden line.
  quiet: { ...type.small, color: colors.ink, opacity: 0.6 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  control: {
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderWidth: border.strong,
    borderColor: colors.ink,
  },
  // A disabled control is dimmed, as a disabled button is (OutlineButton's 0.45).
  disabled: { opacity: 0.45 },
  controlLabel: { ...type.kicker, color: colors.ink },
  line: { ...type.small, color: colors.ink },
});
