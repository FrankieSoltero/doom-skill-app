// The card registry: which component draws each card type. The Today screen draws every card
// through `renderCard`, and skips the types `canRenderCard` rejects.
import type { ReactNode } from 'react';

import type { Card } from '../data';
import { ConceptCard } from './ConceptCard';
import { ExerciseCard } from './ExerciseCard';
import { PredictCard } from './PredictCard';
import { QuizCard } from './QuizCard';
import { ReviewCard } from './ReviewCard';

/** What the screen gives every card: its page, whether it is on screen, and how to move on. */
type CardSlot = {
  /** The card's position in its set, which is also its page and its key in the store. */
  index: number;
  /** True only while this card's page is the current one. */
  active: boolean;
  /** Moves on to the next page, under the same gate as a swipe. */
  onNext: () => void;
};

/** Each card type's own card, keyed by its `type`. */
type CardOfType = { [Each in Card as Each['type']]: Each };
type CardTypeName = keyof CardOfType;
type Renderer<Name extends CardTypeName> = (card: CardOfType[Name], slot: CardSlot) => ReactNode;

// One entry per card type that has a component. A type with no entry is not rendered: the
// session drops its cards before the set starts. Tasks 17, 18, 19, 26, 27 and 28 each add one.
const renderers: { [Name in CardTypeName]?: Renderer<Name> } = {
  concept: (card, { active, onNext }) => (
    <ConceptCard card={card} active={active} onNext={onNext} />
  ),
  quiz: (card, { index, onNext }) => <QuizCard card={card} index={index} onNext={onNext} />,
  predict: (card, { index, onNext }) => <PredictCard card={card} index={index} onNext={onNext} />,
  review: (card, { index, onNext }) => <ReviewCard card={card} index={index} onNext={onNext} />,
  exercise: (card, { index, active, onNext }) => (
    <ExerciseCard card={card} index={index} active={active} onNext={onNext} />
  ),
};

/** The renderer for `type`, typed so it accepts exactly the cards of that type. */
function rendererFor<Name extends CardTypeName>(type: Name): Renderer<Name> | undefined {
  return renderers[type];
}

/** True when a component exists for the card's type. */
export function canRenderCard(card: Card): boolean {
  return rendererFor(card.type) !== undefined;
}

/** The card's component, or `null` for a type with no component yet. */
export function renderCard(card: Card, slot: CardSlot): ReactNode | null {
  const render = rendererFor(card.type);
  return render === undefined ? null : render(card, slot);
}
