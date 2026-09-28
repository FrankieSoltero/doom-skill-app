import { StyleSheet, View } from 'react-native';

import { CardFrame } from '../components/CardFrame';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import type { QuizCard as QuizCardData } from '../data';
import type { CardAnswer } from '../feed/answers';
import { useFeedStore } from '../feed/store';
import { cardTheme } from '../theme';
import { cardKickerText, cardMetaText } from './cardLabels';
import { CardTitle } from './CardText';
import { ChoiceBody } from './ChoiceBody';

type QuizCardProps = {
  card: QuizCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
};

/** The picked option of a choice answer; null for no answer or an answer of another kind. */
function pickedOf(answer: CardAnswer | undefined): number | null {
  return answer?.kind === 'choice' ? answer.picked : null;
}

/**
 * The quiz card (README.md:59-74): kicker row, title, the options stacked in the code font, the
 * explanation once answered, a flex spacer, then Next card, disabled until answered. The answer
 * lives in the feed store at `index`. The card selects only its own pick, so another card's
 * answer does not re-render it. The first pick locks the card; later picks are ignored.
 */
export function QuizCard({ card, index, onNext }: QuizCardProps) {
  const picked = useFeedStore((state) => pickedOf(state.answers[index]));
  const setAnswer = useFeedStore((state) => state.setAnswer);

  const onPick = (option: number) => {
    if (picked !== null) return;
    setAnswer(index, { kind: 'choice', picked: option });
  };

  return (
    <CardFrame type="quiz" kicker={cardKickerText(card)} meta={cardMetaText(card.estSeconds)}>
      <CardTitle size="m">{card.title}</CardTitle>
      <ChoiceBody
        options={card.options}
        correct={card.correct}
        picked={picked}
        explanation={card.explanation}
        accent={cardTheme.quiz.bg}
        layout="stack"
        mono
        onPick={onPick}
      />
      <View testID="quiz-spacer" style={styles.spacer} />
      <PrimaryButton label={copy.nextCard} onPress={onNext} disabled={picked === null} />
    </CardFrame>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
});
