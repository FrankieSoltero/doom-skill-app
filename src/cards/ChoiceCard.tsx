import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { CardFrame } from '../components/CardFrame';
import { PrimaryButton } from '../components/PrimaryButton';
import { copy } from '../copy';
import type { PredictCard as PredictCardData, QuizCard as QuizCardData } from '../data';
import type { CardAnswer } from '../feed/answers';
import { useFeedStore } from '../feed/store';
import { cardTheme } from '../theme';
import { cardKickerText, cardMetaText } from './cardLabels';
import { CardTitle } from './CardText';
import { ChoiceBody } from './ChoiceBody';

type ChoiceCardProps = {
  card: QuizCardData | PredictCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
  /** `stack` for the quiz, `grid` (two columns) for predict. */
  layout: 'stack' | 'grid';
  /** Sets the option labels in the code font. */
  mono: boolean;
  /** Drawn between the title and the options, such as the predict card's code block. */
  children?: ReactNode;
};

/** The picked option of a choice answer; null for no answer or an answer of another kind. */
function pickedOf(answer: CardAnswer | undefined): number | null {
  return answer?.kind === 'choice' ? answer.picked : null;
}

/**
 * The card the quiz and predict share (docs/design/card-feed/README.md:46-49, 59-85): kicker
 * row, title, `children`, the options, the explanation once answered, a flex spacer, then Next
 * card, disabled until answered. The frame, the kicker, the estimate and the correct option's
 * color come from the card's type. The answer lives in the feed store at `index`. The card
 * selects only its own pick, so another card's answer does not re-render it. The first pick
 * locks the card; later picks are ignored.
 */
export function ChoiceCard({ card, index, onNext, layout, mono, children }: ChoiceCardProps) {
  const picked = useFeedStore((state) => pickedOf(state.answers[index]));
  const setAnswer = useFeedStore((state) => state.setAnswer);

  const onPick = (option: number) => {
    if (picked !== null) return;
    setAnswer(index, { kind: 'choice', picked: option });
  };

  return (
    <CardFrame type={card.type} kicker={cardKickerText(card)} meta={cardMetaText(card.estSeconds)}>
      <CardTitle size="m">{card.title}</CardTitle>
      {children}
      <ChoiceBody
        options={card.options}
        correct={card.correct}
        picked={picked}
        explanation={card.explanation}
        accent={cardTheme[card.type].bg}
        layout={layout}
        mono={mono}
        onPick={onPick}
      />
      {/* The spacer's test ID names the card type, such as `quiz-spacer`. */}
      <View testID={`${card.type}-spacer`} style={styles.spacer} />
      <PrimaryButton label={copy.nextCard} onPress={onNext} disabled={picked === null} />
    </CardFrame>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
});
