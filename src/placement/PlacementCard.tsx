import { ChoiceBody } from '../cards/ChoiceBody';
import { CardTitle } from '../cards/CardText';
import { CardFrame } from '../components/CardFrame';
import { CodeBlock } from '../components/CodeBlock';
import { copy } from '../copy';
import type { PlacementCard as PlacementCardData } from '../data';
import { cardTheme } from '../theme';

/**
 * `ChoiceBody` shows a verdict only once `picked` is set. A placement card never sets it, so every
 * option stays idle and this index is never read; the server alone knows the right option.
 */
const NO_ANSWER = 0;

type PlacementCardProps = {
  card: PlacementCardData;
  /** Called with the index of the option the learner pressed. */
  onPick: (index: number) => void;
};

/**
 * One card of the placement quiz (K19) in the quiz and predict cards' frame and option layout
 * (`ChoiceBody`): its kind in the kicker, its title, a predict card's code in a code block, then
 * the options, stacked for a quiz and in a two-column grid for predict, in the code font. It
 * reveals nothing: it has no answer and no explanation, and it keeps no pick. The screen records
 * the pick and shows the next card.
 */
export function PlacementCard({ card, onPick }: PlacementCardProps) {
  return (
    <CardFrame type={card.type} kicker={copy.cardTypes[card.type]}>
      <CardTitle size="m">{card.title}</CardTitle>
      {card.prompt === null ? null : <CodeBlock code={card.prompt} />}
      <ChoiceBody
        options={card.options}
        correct={NO_ANSWER}
        picked={null}
        explanation=""
        accent={cardTheme[card.type].bg}
        layout={card.type === 'quiz' ? 'stack' : 'grid'}
        mono
        onPick={onPick}
      />
    </CardFrame>
  );
}
