// One placement card (src/placement/PlacementCard.tsx): the quiz and predict cards' option layout
// with no answer reveal. The card holds no answer: it reports the pick and the screen moves on.
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { PlacementCard as PlacementCardData } from '../../data';
import { PlacementCard } from '../PlacementCard';

const QUIZ: PlacementCardData = {
  id: '00000000-0000-4000-8000-000000000501',
  type: 'quiz',
  milestone: 1,
  bandIndex: 0,
  title: 'Which call plays a sample?',
  prompt: null,
  options: ['s("bd")', 'note("c3")'],
};
const PREDICT: PlacementCardData = {
  id: '00000000-0000-4000-8000-000000000502',
  type: 'predict',
  milestone: 2,
  bandIndex: 1,
  title: 'How many steps per cycle?',
  prompt: 's("bd*4")',
  options: ['2', '4', '8', '16'],
};

describe('PlacementCard', () => {
  it('shows a quiz card: its kind, title and stacked options, and no code', () => {
    render(<PlacementCard card={QUIZ} onPick={jest.fn()} />);

    expect(screen.getByText('Quiz')).toBeOnTheScreen();
    expect(screen.getByText('Which call plays a sample?')).toBeOnTheScreen();
    const options = screen.getByTestId('choice-options');
    expect(within(options).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByTestId('choice-row')).toBeNull();
    expect(screen.queryByTestId('code-block')).toBeNull();
  });

  it('shows a predict card: its code, and its options in a two-column grid', () => {
    render(<PlacementCard card={PREDICT} onPick={jest.fn()} />);

    expect(screen.getByText('Predict')).toBeOnTheScreen();
    expect(screen.getByTestId('code-block-code')).toHaveTextContent('s("bd*4")');
    expect(screen.getAllByTestId('choice-row')).toHaveLength(2);
  });

  it('reports the index of a pressed option and reveals nothing', () => {
    const onPick = jest.fn();
    render(<PlacementCard card={PREDICT} onPick={onPick} />);

    fireEvent.press(screen.getByRole('button', { name: '8' }));

    expect(onPick).toHaveBeenCalledWith(2);
    expect(screen.queryByTestId('choice-explanation')).toBeNull();
    expect(screen.queryByTestId('option-icon-correct')).toBeNull();
    for (const option of screen.getAllByRole('button')) {
      expect(option).toBeEnabled();
    }
  });
});
