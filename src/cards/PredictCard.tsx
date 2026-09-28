import { CodeBlock } from '../components/CodeBlock';
import type { PredictCard as PredictCardData } from '../data';
import { ChoiceCard } from './ChoiceCard';

type PredictCardProps = {
  card: PredictCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
};

/**
 * The predict card (docs/design/card-feed/README.md:76-85): kicker row, title, the card's code
 * in a code block, the options in a two-column grid in the body font, the explanation once
 * answered, then Next card. The correct option shows in aqua, the predict color. State and
 * locking are the quiz's, through `ChoiceCard`.
 */
export function PredictCard({ card, index, onNext }: PredictCardProps) {
  return (
    <ChoiceCard card={card} index={index} onNext={onNext} layout="grid" mono={false}>
      <CodeBlock code={card.code} />
    </ChoiceCard>
  );
}
