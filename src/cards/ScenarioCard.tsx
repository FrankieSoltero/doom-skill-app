import { Passage } from '../components/Passage';
import type { ScenarioCard as ScenarioCardData } from '../data';
import { ChoiceCard } from './ChoiceCard';

type ScenarioCardProps = {
  card: ScenarioCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
};

/**
 * The scenario card of a prose topic (M9 plan C): kicker row ("Scenario" and the node), title,
 * the situation in a passage, the options in a two-column grid in the body font, the explanation
 * once answered, then Next card. It takes predict's colors (Q5). State and locking are the
 * quiz's, through `ChoiceCard`.
 */
export function ScenarioCard({ card, index, onNext }: ScenarioCardProps) {
  return (
    <ChoiceCard card={card} index={index} onNext={onNext} layout="grid" mono={false}>
      <Passage text={card.situation} />
    </ChoiceCard>
  );
}
