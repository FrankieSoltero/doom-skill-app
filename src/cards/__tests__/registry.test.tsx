import { fireEvent, render, screen } from '@testing-library/react-native';
import { isValidElement } from 'react';

import { cardsByType } from '../../feed/testing/sets';
import { ConceptCard } from '../ConceptCard';
import { PredictCard } from '../PredictCard';
import { QuizCard } from '../QuizCard';
import { canRenderCard, renderCard } from '../registry';
import { ReviewCard } from '../ReviewCard';

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;

// The card types no task has registered yet. Each later task moves its type out of this list.
const UNREGISTERED = [exercise, checkpoint];

describe('renderCard', () => {
  it('renders a concept card with the card, its active flag and onNext', () => {
    const onNext = jest.fn<undefined, []>();

    const element = renderCard(concept, { index: 0, active: true, onNext });

    expect(isValidElement(element)).toBe(true);
    expect(isValidElement(element) && element.type).toBe(ConceptCard);
    expect(isValidElement<object>(element) && element.props).toStrictEqual({
      card: concept,
      active: true,
      onNext,
    });
  });

  it('draws the concept card, and its button calls onNext', () => {
    const onNext = jest.fn<undefined, []>();

    render(<>{renderCard(concept, { index: 0, active: false, onNext })}</>);
    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));

    expect(screen.getByText(concept.title)).toBeOnTheScreen();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('renders a quiz card with the card, its index and onNext, and no active flag', () => {
    const onNext = jest.fn<undefined, []>();

    const element = renderCard(quiz, { index: 3, active: true, onNext });

    expect(isValidElement(element) && element.type).toBe(QuizCard);
    expect(isValidElement<object>(element) && element.props).toStrictEqual({
      card: quiz,
      index: 3,
      onNext,
    });
  });

  it('draws the quiz card', () => {
    render(<>{renderCard(quiz, { index: 0, active: false, onNext: jest.fn() })}</>);

    expect(screen.getByText(quiz.title)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next card' })).toBeOnTheScreen();
  });

  it('renders a predict card with the card, its index and onNext, and no active flag', () => {
    const onNext = jest.fn<undefined, []>();

    const element = renderCard(predict, { index: 5, active: false, onNext });

    expect(isValidElement(element) && element.type).toBe(PredictCard);
    expect(isValidElement<object>(element) && element.props).toStrictEqual({
      card: predict,
      index: 5,
      onNext,
    });
  });

  it('draws the predict card, with its code', () => {
    render(<>{renderCard(predict, { index: 0, active: true, onNext: jest.fn() })}</>);

    expect(screen.getByText(predict.title)).toBeOnTheScreen();
    expect(screen.getByTestId('code-block-code')).toHaveTextContent(predict.code);
    expect(screen.getByRole('button', { name: 'Next card' })).toBeOnTheScreen();
  });

  it('renders a review card with the card, its index and onNext, and no active flag', () => {
    const onNext = jest.fn<undefined, []>();

    const element = renderCard(review, { index: 2, active: true, onNext });

    expect(isValidElement(element) && element.type).toBe(ReviewCard);
    expect(isValidElement<object>(element) && element.props).toStrictEqual({
      card: review,
      index: 2,
      onNext,
    });
  });

  it('draws the review card, with its prompt and reveal button', () => {
    render(<>{renderCard(review, { index: 0, active: true, onNext: jest.fn() })}</>);

    expect(screen.getByText(review.prompt)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Recall it, then tap to reveal' })).toBeOnTheScreen();
  });

  it.each(UNREGISTERED)('returns null for $type, which has no component yet', (card) => {
    expect(renderCard(card, { index: 0, active: true, onNext: jest.fn() })).toBeNull();
  });
});

describe('canRenderCard', () => {
  it.each([concept, quiz, predict, review])('accepts a $type card', (card) => {
    expect(canRenderCard(card)).toBe(true);
  });

  it.each(UNREGISTERED)('rejects $type', (card) => {
    expect(canRenderCard(card)).toBe(false);
  });
});
