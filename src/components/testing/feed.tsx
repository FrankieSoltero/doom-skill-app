/**
 * Shared setup for the Today feed screen tests. It lives outside `__tests__/` because Jest runs
 * every file there as a suite. Tests that use it mock `react-native-safe-area-context` with the
 * package's Jest mock, and call `jest.useFakeTimers()` in `beforeEach` (the pager helpers need it).
 */
import { render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { renderCard } from '../../cards/registry';
import type { Card, CardSource } from '../../data';
import { FeedScreen } from '../FeedScreen';
import { settle } from './pager';

type CardDrawer = typeof renderCard;
type Slot = Parameters<CardDrawer>[1];

/** The reference device's top inset. */
export const TOP_INSET = 47;

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: TOP_INSET, right: 0, bottom: 34, left: 0 },
};

/**
 * Renders the feed screen over `source` and settles. Given `drawCard`, the screen draws every card
 * with it and keeps every card type; otherwise it uses the card registry.
 */
export async function renderFeed(source: CardSource, drawCard?: CardDrawer): Promise<void> {
  const drawProp =
    drawCard === undefined ? {} : { renderCard: drawCard, canRenderCard: () => true };
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FeedScreen source={source} {...drawProp} />
    </SafeAreaProvider>,
  );
  await settle();
}

/** The text a stand-in card shows: its type, its index, and whether it is active. */
export function stubText(type: Card['type'], index: number, active: boolean): string {
  return [type, String(index), active ? 'active' : 'idle'].join(' ');
}

/** The label of a stand-in card's button, which calls `onNext`. */
export function stubNext(index: number): string {
  return ['Next from', String(index)].join(' ');
}

/** A stand-in for the registry: each card as its `stubText`, with a button that calls `onNext`. */
export function stubCard(card: Card, { index, active, onNext }: Slot) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={stubNext(index)} onPress={onNext}>
      <Text>{stubText(card.type, index, active)}</Text>
    </Pressable>
  );
}
