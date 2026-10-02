import { CodeBlock } from '../components/CodeBlock';
import type { PredictCard as PredictCardData } from '../data';
import { selectPlaysStrudel, useFeedStore } from '../feed/store';
import { ChoiceCard } from './ChoiceCard';
import { PlayableCode } from './PlayableCode';
import { playerOwner } from './usePlayableCode';

type PredictCardProps = {
  card: PredictCardData;
  /** The card's position in its set: its key in the store's answers. */
  index: number;
  /** True while this card is the one on screen. Leaving it stops its code playing. */
  active: boolean;
  /** Called when the learner presses Next card, which is enabled once the card is answered. */
  onNext: () => void;
};

/**
 * The predict card (docs/design/card-feed/README.md:76-85): kicker row, title, the card's code
 * in a code block, the options in a two-column grid in the code font, centered with no verdict
 * icon (prototype line 132, screenshots/03-predict-answered.png), the explanation once answered,
 * then Next card. The correct option shows in aqua, the predict color. State and locking are the
 * quiz's, through `ChoiceCard`.
 *
 * In a Strudel set, once an option is picked, the code can be played (M9 plan I, X6): it becomes a
 * `PlayableCode` with Play / Stop that never plays by itself. Before the pick it stays a plain
 * code block with no player, since hearing the code would give the answer away. The card reads
 * the same answer `ChoiceCard` reads: a choice stored at `index`.
 */
export function PredictCard({ card, index, active, onNext }: PredictCardProps) {
  const answered = useFeedStore((state) => state.answers[index]?.kind === 'choice');
  const plays = useFeedStore(selectPlaysStrudel);

  return (
    <ChoiceCard card={card} index={index} onNext={onNext} layout="grid" mono>
      {answered && plays ? (
        <PlayableCode
          code={card.code}
          owner={playerOwner(card, index)}
          active={active}
          autoplay={false}
        />
      ) : (
        <CodeBlock code={card.code} />
      )}
    </ChoiceCard>
  );
}
