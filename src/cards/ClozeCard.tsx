import { Passage } from '../components/Passage';
import { copy } from '../copy';
import type { ClozeCard as ClozeCardData } from '../data';
import { ChoiceCard } from './ChoiceCard';

/** The blank in a cloze card's sentence, as the API writes it. */
const BLANK = '___';

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
 * State and locking are the quiz's, through `ChoiceCard`. A screen reader says `copy.blankSpoken`
 * for the blank, so the sentence is not read as complete.
 */
export function ClozeCard({ card, index, onNext }: ClozeCardProps) {
  return (
    <ChoiceCard card={card} index={index} onNext={onNext} layout="grid" mono={false}>
      <Passage text={card.text} spokenLabel={card.text.replaceAll(BLANK, copy.blankSpoken)} />
    </ChoiceCard>
  );
}
