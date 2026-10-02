import { Passage } from '../components/Passage';
import type { NumericCard as NumericCardData } from '../data';
import { ChoiceCard } from './ChoiceCard';

type NumericCardProps = {
  card: NumericCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
};

/**
 * The numeric card of a quantitative topic (M9 plan D): kicker row ("Work it out" and the node),
 * title, the problem in a passage, the options in a two-column grid in the body font, the
 * explanation once answered (its `**` pair draws the answer bold), then Next card. It takes the
 * quiz's colors (R4). State and locking are the quiz's, through `ChoiceCard`.
 */
export function NumericCard({ card, index, onNext }: NumericCardProps) {
  return (
    <ChoiceCard card={card} index={index} onNext={onNext} layout="grid" mono={false}>
      <Passage text={card.problem} />
    </ChoiceCard>
  );
}
