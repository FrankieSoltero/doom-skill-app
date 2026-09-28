/**
 * Test support: the demo card of one type, read through the app's card source (rule SS-6), so a
 * card test can check the content the design shows. It lives outside `__tests__/` because Jest
 * runs every file there as a suite. The source serves its one set once per module registry, so
 * the set is read on the first call and kept: any number of calls in one test file work.
 */
import { cardSource } from '../../data';
import type { Card, FeedSet } from '../../data';

/** The demo set, read once on first use. */
let demoSet: Promise<FeedSet | null> | undefined;

/** The first card of `type` in the demo set. Throws if the set has none. */
export async function demoCard<Type extends Card['type']>(
  type: Type,
): Promise<Extract<Card, { type: Type }>> {
  demoSet ??= cardSource.getNextSet();
  const set = await demoSet;
  const card = set?.cards.find((item): item is Extract<Card, { type: Type }> => item.type === type);
  if (card === undefined) throw new Error(`The bundled source served no ${type} card`);
  return card;
}
