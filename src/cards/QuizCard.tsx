import type { QuizCard as QuizCardData } from '../data';
import { ChoiceCard } from './ChoiceCard';

type QuizCardProps = {
  card: QuizCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
};

/**
 * The quiz card (docs/design/card-feed/README.md:59-74): kicker row, title, the options stacked
 * in the code font, the explanation once answered, a flex spacer, then Next card, disabled until
 * answered. The correct option shows in coral, the quiz color. State and locking live in
 * `ChoiceCard`.
 */
export function QuizCard({ card, index, onNext }: QuizCardProps) {
  return <ChoiceCard card={card} index={index} onNext={onNext} layout="stack" mono />;
}
