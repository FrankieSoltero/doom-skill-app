// The card frame's flag action and its thank-you line, with an API to send to: `flagCard` of
// src/data is replaced by a mock (the demo sets have none, CardFrame.test.tsx).
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { FlagTarget } from '../../cards/FlagButton';
import type { Card } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { CardFrame } from '../CardFrame';

const mockFlag = jest.fn<Promise<void>, [string, string]>(() => Promise.resolve());
jest.mock('../../data', () => ({
  ...jest.requireActual<object>('../../data'),
  flagCard: (cardId: string, reason: string) => mockFlag(cardId, reason),
}));

const CARD: Card = { ...cardsByType.quiz, id: '5d1f0c2e-7a3b-4c4d-9e5f-6a7b8c9d0e1f' };
const THANKS = "Thanks. We'll look at this card.";

function renderFrame(card: Card | null) {
  const frame = (
    <CardFrame type="quiz" kicker="Quiz · Mini-notation" meta="~20 s">
      <Text>body</Text>
    </CardFrame>
  );
  render(card === null ? frame : <FlagTarget card={card}>{frame}</FlagTarget>);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockFlag.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CardFrame flag action', () => {
  it("puts the flag action in the kicker row, after the meta, in the frame's corner", () => {
    renderFrame(CARD);
    const row = screen.getByTestId('card-kicker-row');

    expect(within(row).getByRole('button', { name: 'Flag this card' })).toBeOnTheScreen();
    expect(within(row).getByText('~20 s')).toBeOnTheScreen();
  });

  it('has no flag action on a frame that holds no card the feed drew (the Summary)', () => {
    renderFrame(null);

    expect(screen.queryByRole('button', { name: 'Flag this card' })).toBeNull();
  });

  it('shows the thank-you line over the card for 3 seconds after a reason is chosen', async () => {
    renderFrame(CARD);

    fireEvent.press(screen.getByRole('button', { name: 'Flag this card' }));
    fireEvent.press(screen.getByRole('button', { name: 'Unclear' }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFlag.mock.calls).toStrictEqual([[CARD.id, 'unclear']]);
    expect(within(screen.getByTestId('card-frame')).getByText(THANKS)).toBeOnTheScreen();
    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(screen.getByText(THANKS)).toBeOnTheScreen();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.queryByText(THANKS)).toBeNull();
  });
});
