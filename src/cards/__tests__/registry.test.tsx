import { fireEvent, render, screen } from '@testing-library/react-native';
import { isValidElement } from 'react';

import type { Card } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { CheckpointCard } from '../CheckpointCard';
import { ConceptCard } from '../ConceptCard';
import { ExerciseCard } from '../ExerciseCard';
import { PredictCard } from '../PredictCard';
import { QuizCard } from '../QuizCard';
import { canRenderCard, renderCard, renderSummary } from '../registry';
import { ReviewCard } from '../ReviewCard';
import { SummaryCard } from '../SummaryCard';
import { summarySet } from '../testing/summarySets';

const { concept, quiz, predict, exercise, review, checkpoint } = cardsByType;

// A card of a type the registry does not know, as a newer server could send. The cast is the
// only way to build one: the schema's types allow no such card.
const UNKNOWN = { ...concept, type: 'flashcard' } as unknown as Card;

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

  it('returns null for a card of a type it does not know', () => {
    expect(renderCard(UNKNOWN, { index: 0, active: true, onNext: jest.fn() })).toBeNull();
  });
});

describe('renderCard for the exercise card', () => {
  it('renders an exercise card with the card, its index, its active flag and onNext', () => {
    const onNext = jest.fn<undefined, []>();

    const element = renderCard(exercise, { index: 4, active: true, onNext });

    expect(isValidElement(element) && element.type).toBe(ExerciseCard);
    expect(isValidElement<object>(element) && element.props).toStrictEqual({
      card: exercise,
      index: 4,
      active: true,
      onNext,
    });
  });

  it('draws the exercise card, with its editor, Play, Check and Next card', () => {
    render(<>{renderCard(exercise, { index: 0, active: false, onNext: jest.fn() })}</>);

    expect(screen.getByText(exercise.title)).toBeOnTheScreen();
    expect(screen.getByLabelText('Code editor')).toHaveDisplayValue(exercise.starterCode);
    for (const name of ['Play', 'Check', 'Next card']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }
  });
});

describe('renderCard for the checkpoint card', () => {
  it('renders a checkpoint card with the card, its index, its active flag and onNext', () => {
    const onNext = jest.fn<undefined, []>();

    const element = renderCard(checkpoint, { index: 5, active: false, onNext });

    expect(isValidElement(element) && element.type).toBe(CheckpointCard);
    expect(isValidElement<object>(element) && element.props).toStrictEqual({
      card: checkpoint,
      index: 5,
      active: false,
      onNext,
    });
  });

  it('draws the checkpoint card, with its editor, rubric and Submit for grading', () => {
    render(<>{renderCard(checkpoint, { index: 0, active: true, onNext: jest.fn() })}</>);

    expect(screen.getByText(checkpoint.title)).toBeOnTheScreen();
    expect(screen.getByLabelText('Code editor')).toHaveDisplayValue(checkpoint.starterCode);
    expect(screen.getAllByRole('checkbox')).toHaveLength(checkpoint.rubric.length);
    expect(screen.getByRole('button', { name: 'Submit for grading' })).toBeOnTheScreen();
  });
});

describe('renderSummary', () => {
  it('renders the Summary card with exactly the props it is given', () => {
    const props = {
      set: summarySet(),
      active: false,
      onKeepGoing: jest.fn<undefined, []>(),
      onViewTree: jest.fn<undefined, []>(),
      nextSetStatus: 'loading' as const,
    };

    const element = renderSummary(props);

    expect(isValidElement(element) && element.type).toBe(SummaryCard);
    expect(isValidElement<object>(element) && element.props).toStrictEqual(props);
  });

  it('draws the Summary card, and Keep going calls onKeepGoing', () => {
    const onKeepGoing = jest.fn<undefined, []>();
    const set = summarySet();

    render(
      <>
        {renderSummary({
          set,
          active: true,
          onKeepGoing,
          onViewTree: jest.fn(),
          nextSetStatus: 'idle',
        })}
      </>,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Keep going' }));

    expect(screen.getByText('DAY 4 COMPLETE')).toBeOnTheScreen();
    expect(onKeepGoing).toHaveBeenCalledTimes(1);
  });
});

describe('canRenderCard', () => {
  it.each([concept, quiz, predict, exercise, review, checkpoint])(
    'accepts a $type card',
    (card) => {
      expect(canRenderCard(card)).toBe(true);
    },
  );

  it('rejects a card of a type it does not know', () => {
    expect(canRenderCard(UNKNOWN)).toBe(false);
  });
});
