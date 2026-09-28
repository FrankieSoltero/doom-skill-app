import { fireEvent, render, screen } from '@testing-library/react-native';
import { isValidElement } from 'react';

import { cardsByType } from '../../feed/testing/sets';
import { ConceptCard } from '../ConceptCard';
import { canRenderCard, renderCard } from '../registry';

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;

// The card types no task has registered yet. Each later task moves its type out of this list.
const UNREGISTERED = [quiz, predict, exercise, review, checkpoint];

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

  it.each(UNREGISTERED)('returns null for $type, which has no component yet', (card) => {
    expect(renderCard(card, { index: 0, active: true, onNext: jest.fn() })).toBeNull();
  });
});

describe('canRenderCard', () => {
  it('accepts a concept card', () => {
    expect(canRenderCard(concept)).toBe(true);
  });

  it.each(UNREGISTERED)('rejects $type', (card) => {
    expect(canRenderCard(card)).toBe(false);
  });
});
