/**
 * One question in the Questions tab's inbox (M10 plan Q Task 11, spec 3.4; D16): who asked it, the
 * day it was asked, its text and, for the learner's own question that flags hid, the "hidden
 * pending review" line; then the answers the reply carries, each with its author and text (a
 * hidden answer reaches its author only, with the same line). An author is "You" on the learner's
 * own item, else their display name, else "A learner". The question shape carries no topic, so the
 * card shows none.
 *
 * Under the text, the question's own controls (Task 12): Delete in two taps on the learner's own
 * question (decision Q13), Flag (the reason `other`, one tap, then "Flagged") on another's; a
 * refused one shows its line there.
 *
 * The answers are plain rows here; `renderAnswer` replaces each row (the answer controls, Task 12).
 * `children` is drawn at the card's foot (the answer composer under a question to answer).
 */
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { requireApi } from '../api/query';
import { deleteQuestion, flagQuestion, type Answer, type Question } from '../data/qa';
import { colors, space, type } from '../theme';
import { byline, FlagOrDelete, HiddenLine, OutcomeLines } from './AnswerRow';
import { questionKeys, useQaAction, useTwoTapAction } from './useQaAction';

type QuestionCardProps = {
  question: Question;
  /** Draws one answer in place of the plain row. */
  renderAnswer?: (answer: Answer, question: Question) => ReactNode;
  /** Drawn under the answers. */
  children?: ReactNode;
};

/** The question's own Delete or Flag, and the line of a refused one (module comment). */
function QuestionControls({ question }: { question: Question }) {
  const keys = questionKeys(question);
  const flag = useQaAction(() => flagQuestion(requireApi(), question.id, 'other'), keys);
  const remove = useTwoTapAction(() => deleteQuestion(requireApi(), question.id), keys);
  return (
    <>
      <View style={styles.controls}>
        <FlagOrDelete mine={question.mine} flag={flag} remove={remove} />
      </View>
      <OutcomeLines outcomes={[flag.outcome, remove.outcome]} />
    </>
  );
}

/** An answer as a plain row: its author and its text. */
function AnswerLine({ answer }: { answer: Answer }) {
  return (
    <View style={styles.answer}>
      <Text style={styles.author}>{byline(answer)}</Text>
      <Text style={styles.text}>{answer.text}</Text>
      <HiddenLine status={answer.status} />
    </View>
  );
}

/** The card (module comment). */
export function QuestionCard({ question, renderAnswer, children }: QuestionCardProps) {
  return (
    <View testID="inbox-question" style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.author}>{byline(question)}</Text>
        <Text style={styles.date}>{new Date(question.createdAt).toLocaleDateString()}</Text>
      </View>
      <Text style={styles.text}>{question.text}</Text>
      <HiddenLine status={question.status} />
      <QuestionControls question={question} />
      {question.answers.map((answer) => (
        <View key={answer.id}>
          {renderAnswer === undefined ? (
            <AnswerLine answer={answer} />
          ) : (
            renderAnswer(answer, question)
          )}
        </View>
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space[2],
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ink,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] },
  // An answer sits under its question, set in from the left, as in the ask sheet's list.
  answer: { gap: space[1], paddingLeft: space[4] },
  author: { ...type.kicker, color: colors.ink },
  date: { ...type.small, color: colors.neutral[700] },
  text: { ...type.body, color: colors.ink },
});
