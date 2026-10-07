/**
 * The Questions tab's lists (M10 plan Q Task 11, spec 3.4): "You can answer" over the questions
 * the learner is ahead on, each with the answer composer under it, then "Answers to your
 * questions" over the learner's own questions that have an answer. A section with no question is
 * left out; the screen shows the empty line when both are (app/(tabs)/questions.tsx). Every answer
 * is drawn with its controls (`AnswerRow`, Task 12).
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import type { Inbox, Question } from '../data/qa';
import { colors, space, type } from '../theme';
import { AnswerComposer } from './AnswerComposer';
import { AnswerRow } from './AnswerRow';
import { QuestionCard } from './QuestionCard';

type SectionProps = {
  title: string;
  questions: readonly Question[];
  /** Puts the answer composer under each question. */
  answerable: boolean;
};

/** One section: its heading and its questions; nothing when it has none. */
function Section({ title, questions, answerable }: SectionProps) {
  if (questions.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {questions.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          renderAnswer={(answer, asked) => <AnswerRow answer={answer} question={asked} />}
        >
          {answerable ? <AnswerComposer question={question} /> : null}
        </QuestionCard>
      ))}
    </View>
  );
}

/** The lists (module comment). */
export function InboxList({ inbox }: { inbox: Inbox }) {
  return (
    <ScrollView
      testID="inbox-lists"
      contentContainerStyle={styles.content}
      // A tap on Answer while the keyboard is up presses it at once.
      keyboardShouldPersistTaps="handled"
    >
      <Section title={copy.qa.toAnswer} questions={inbox.toAnswer} answerable />
      <Section title={copy.qa.answered} questions={inbox.answered} answerable={false} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: space[6], paddingBottom: space[6] },
  section: { gap: space[2] },
  heading: { ...type.kicker, color: colors.ink },
});
