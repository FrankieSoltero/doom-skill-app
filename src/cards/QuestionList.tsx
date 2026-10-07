/**
 * A card's peer questions (M10 plan Q Task 9, spec 3.4; D16), as the ask sheet
 * (src/cards/AskSheet.tsx) shows them: each question with its author, its text and, for the
 * learner's own question that flags hid, the "hidden pending review" line, then its answers drawn
 * the same way. An author is "You" on the learner's own item, else their display name, else "A
 * learner" (an author who did not opt in to show a name). No controls here: answering, accepting,
 * marking helpful, flagging and deleting are the Questions tab's.
 */
import { StyleSheet, Text, View } from 'react-native';

import { copy } from '../copy';
import type { Author, Question } from '../data/qa';
import { colors, space, type } from '../theme';

/** What a question and an answer share: the parts this list draws. */
type Item = { text: string; status: string; author: Author; mine: boolean };

/** The author line of `item` (module comment). */
function authorOf({ author, mine }: Item): string {
  if (mine) return copy.qa.you;
  return author.name ?? copy.qa.aLearner;
}

/** One question or answer: its author, its text, and the hidden line when flags hid it. */
function Entry({ item }: { item: Item }) {
  return (
    <View style={styles.entry}>
      <Text style={styles.author}>{authorOf(item)}</Text>
      <Text style={styles.text}>{item.text}</Text>
      {item.status === 'hidden' ? <Text style={styles.hidden}>{copy.qa.hiddenPending}</Text> : null}
    </View>
  );
}

/** The questions in the order given, each followed by its answers; "No questions yet." for none. */
export function QuestionList({ questions }: { questions: readonly Question[] }) {
  if (questions.length === 0) return <Text style={styles.text}>{copy.qa.noQuestions}</Text>;
  return questions.map((question) => (
    <View key={question.id} testID="question" style={styles.question}>
      <Entry item={question} />
      {question.answers.map((answer) => (
        <View key={answer.id} style={styles.answer}>
          <Entry item={answer} />
        </View>
      ))}
    </View>
  ));
}

const styles = StyleSheet.create({
  question: {
    gap: space[2],
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.ink,
  },
  // An answer sits under its question, set in from the left.
  answer: { paddingLeft: space[4] },
  entry: { gap: space[1] },
  author: { ...type.kicker, color: colors.ink },
  text: { ...type.body, color: colors.ink },
  // The project has no muted text token: the ink at 60% opacity, as the help sheet's hints.
  hidden: { ...type.small, color: colors.ink, opacity: 0.6 },
});
