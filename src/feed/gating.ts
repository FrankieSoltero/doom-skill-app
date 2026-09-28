// The gating rule of the feed: whether a card's answer lets the learner move past it. Pure
// functions, no rendering.
import type { Card } from '../data';
import type { CardAnswer } from './answers';

type AnswerRule = (answer: CardAnswer | undefined) => boolean;

const isChoice: AnswerRule = (answer) => answer?.kind === 'choice';

// One rule per card type. The mapped type makes a new card type a compile error until it has a
// rule here; there is no default that would let it through.
const rules: { [Type in Card['type']]: AnswerRule } = {
  concept: () => true,
  quiz: isChoice,
  predict: isChoice,
  exercise: (answer) => answer?.kind === 'exercise' && answer.result === 'pass',
  review: (answer) => answer?.kind === 'review' && answer.rating !== null,
  checkpoint: (answer) => answer?.kind === 'checkpoint' && answer.status === 'done',
};

/**
 * True when `answer` completes `card`. A concept card needs no answer. An answer of the wrong
 * kind for the card, such as a choice stored against an exercise, does not count. A checkpoint
 * counts once graded, whether or not the grade passed.
 */
export function isAnswered(card: Card, answer: CardAnswer | undefined): boolean {
  return rules[card.type](answer);
}
