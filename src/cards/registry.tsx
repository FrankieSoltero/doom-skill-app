// The card registry: which component draws each card type, and the Summary page. The Today screen
// draws every card through `renderCard`, skips the types `canRenderCard` rejects, and draws the
// Summary through `renderSummary`.
import type { ReactNode } from 'react';

import type { Card } from '../data';
import { CheckpointCard } from './CheckpointCard';
import { ConceptCard } from './ConceptCard';
import { ExerciseCard } from './ExerciseCard';
import { PredictCard } from './PredictCard';
import { QuizCard } from './QuizCard';
import { ReviewCard } from './ReviewCard';
import { SummaryCard } from './SummaryCard';
import type { SummaryCardProps } from './SummaryCard';

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

// One entry per card type in the schema: a new type fails to compile until it has a component.
const renderers: { [Name in CardTypeName]: Renderer<Name> } = {
  concept: (card, { active, onNext }) => (
    <ConceptCard card={card} active={active} onNext={onNext} />
  ),
  quiz: (card, { index, onNext }) => <QuizCard card={card} index={index} onNext={onNext} />,
  predict: (card, { index, onNext }) => <PredictCard card={card} index={index} onNext={onNext} />,
  review: (card, { index, onNext }) => <ReviewCard card={card} index={index} onNext={onNext} />,
  exercise: (card, { index, active, onNext }) => (
    <ExerciseCard card={card} index={index} active={active} onNext={onNext} />
  ),
  checkpoint: (card, { index, active, onNext }) => (
    <CheckpointCard card={card} index={index} active={active} onNext={onNext} />
  ),
};

/** The renderer for `type`, typed so it accepts exactly the cards of that type. */
function rendererFor<Name extends CardTypeName>(type: Name): Renderer<Name> {
  return renderers[type];
}

/**
 * True when a component exists for the card's type. Every schema type has one, so this guards
 * against bad data only: a card whose `type` the types say it cannot have.
 */
export function canRenderCard(card: Card): boolean {
  return Object.hasOwn(renderers, card.type);
}

/** The card's component, or `null` for a card of a type with no component (bad data). */
export function renderCard(card: Card, slot: CardSlot): ReactNode | null {
  return canRenderCard(card) ? rendererFor(card.type)(card, slot) : null;
}

/** The Summary card, the last page of every set, with the props it is given. */
export function renderSummary(props: SummaryCardProps): ReactNode {
  return <SummaryCard {...props} />;
}
