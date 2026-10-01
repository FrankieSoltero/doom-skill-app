// The card frame's Sources action (M6 hardening Task 12): shown in the kicker row only when the
// card the frame holds has sources; it opens the sheet that lists them. The demo cards have none.
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SourcesTarget } from '../../cards/SourcesButton';
import type { Card } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { CardFrame } from '../CardFrame';

const SOURCES = [
  { title: 'Mini-notation', url: 'https://strudel.cc/learn/mini-notation/', license: 'MIT' },
];
const CARD: Card = { ...cardsByType.quiz, sources: SOURCES };

function renderFrame(card: Card | null) {
  const frame = (
    <CardFrame type="quiz" kicker="Quiz · Mini-notation" meta="~20 s">
      <Text>body</Text>
    </CardFrame>
  );
  render(card === null ? frame : <SourcesTarget card={card}>{frame}</SourcesTarget>);
}

const sourcesAction = () => screen.queryByRole('button', { name: 'Sources' });

describe('CardFrame Sources action', () => {
  it('puts the Sources action in the kicker row of a card with sources', () => {
    renderFrame(CARD);

    expect(
      within(screen.getByTestId('card-kicker-row')).getByRole('button', { name: 'Sources' }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('sources-sheet')).toBeNull();
  });

  it('opens the sheet of the card sources, and Close closes it', () => {
    renderFrame(CARD);

    fireEvent.press(screen.getByRole('button', { name: 'Sources' }));

    const sheet = screen.getByTestId('sources-sheet');
    expect(within(sheet).getByText('Mini-notation')).toBeOnTheScreen();
    expect(within(sheet).getByText('Licence: MIT')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('sources-sheet')).toBeNull();
  });

  it.each([
    ['a demo card, which has none', cardsByType.quiz],
    ['a card whose list is empty', { ...cardsByType.quiz, sources: [] }],
    ['the checkpoint', { ...cardsByType.checkpoint, sources: [] }],
  ])('has no Sources action on %s', (_name, card: Card) => {
    renderFrame(card);

    expect(sourcesAction()).toBeNull();
  });

  it('has no Sources action on a frame that holds no card the feed drew (the Summary)', () => {
    renderFrame(null);

    expect(sourcesAction()).toBeNull();
  });
});
