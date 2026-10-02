import { Passage } from '../components/Passage';
import type { ClozeCard as ClozeCardData } from '../data';
import { ChoiceCard } from './ChoiceCard';

type ClozeCardProps = {
  card: ClozeCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
};

/**
 * The fill-in-the-blank card of a prose topic (M9 plan C): kicker row ("Fill in" and the node),
 * title, the source sentence with its blank in a passage, the options in a two-column grid in the
 * body font, the explanation once answered, then Next card. It takes the quiz's colors (Q5).
 * State and locking are the quiz's, through `ChoiceCard`.
 */
export function ClozeCard({ card, index, onNext }: ClozeCardProps) {
  return (
    <ChoiceCard card={card} index={index} onNext={onNext} layout="grid" mono={false}>
      <Passage text={card.text} />
    </ChoiceCard>
  );
}
