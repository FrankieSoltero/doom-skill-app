// The feed screen names each card it draws to the card's frame, for the frame's flag action
// (src/cards/FlagButton.tsx): a card with a server id gets the action, a checkpoint does not.
// `flagCard` of src/data is replaced by a mock, as the API source would give one.
import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { Card } from '../../data';
import { useFeedStore } from '../../feed/store';
import { cardsByType, makeSet } from '../../feed/testing/sets';
import { scriptedSource } from '../../feed/testing/sources';
import { CardFrame } from '../CardFrame';
import { renderFeed } from '../testing/feed';
import { layout } from '../testing/pager';

jest.mock('react-native-safe-area-context', () => {
  const mock = jest.requireActual<{ default: object }>('react-native-safe-area-context/jest/mock');
  return mock.default;
});
jest.mock('../../log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('../../data', () => ({
  ...jest.requireActual<object>('../../data'),
  flagCard: () => Promise.resolve(),
}));

const ID = '5d1f0c2e-7a3b-4c4d-9e5f-6a7b8c9d0e1f';

/** Draws each card as a bare frame, so only the screen can have named the card to it. */
function frameCard(card: Card) {
  return (
    <CardFrame type={card.type} kicker={card.type}>
      <Text>drawn</Text>
    </CardFrame>
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  useFeedStore.setState(useFeedStore.getInitialState(), true);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('FeedScreen flag target', () => {
  it("gives a drawn card's frame the flag action", async () => {
    await renderFeed(scriptedSource(makeSet(1, [{ ...cardsByType.quiz, id: ID }])), frameCard);
    await layout(700);

    expect(screen.getByRole('button', { name: 'Flag this card' })).toBeOnTheScreen();
  });

  it("gives a checkpoint's frame none: its id is a milestone's", async () => {
    const checkpoint = { ...cardsByType.checkpoint, id: ID };
    await renderFeed(scriptedSource(makeSet(1, [checkpoint])), frameCard);
    await layout(700);

    expect(screen.getByText('drawn')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Flag this card' })).toBeNull();
  });

  it("gives a drawn card's frame its sources, for the Sources action", async () => {
    const sources = [{ title: 'Docs', url: 'https://strudel.cc/', license: null }];
    await renderFeed(scriptedSource(makeSet(1, [{ ...cardsByType.quiz, sources }])), frameCard);
    await layout(700);

    expect(screen.getByRole('button', { name: 'Sources' })).toBeOnTheScreen();
  });
});
