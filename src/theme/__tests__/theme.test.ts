import { cardTheme, colors, type CardType } from '../index';

// A record keyed by CardType: the compiler rejects a missing or an extra member,
// so this list always matches the CardType union.
const CARD_TYPE_MEMBERS: Record<CardType, true> = {
  concept: true,
  quiz: true,
  predict: true,
  exercise: true,
  review: true,
  checkpoint: true,
  summary: true,
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const RGBA_COLOR = /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/;

/** Walks a nested token object and returns every string leaf with its dotted path. */
function collectStringLeaves(value: unknown, path: string): [string, string][] {
  if (typeof value === 'string') {
    return [[path, value]];
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      collectStringLeaves(child, path === '' ? key : `${path}.${key}`),
    );
  }
  return [];
}

/** Maps each own key of an object to the `typeof` of its value; undefined for a non-object. */
function describeShape(value: unknown): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, typeof child]));
}

describe('theme', () => {
  it('gives every CardType member a cardTheme entry with bg, fg, shadow and kicker', () => {
    for (const member of Object.keys(CARD_TYPE_MEMBERS) as CardType[]) {
      expect({ member, shape: describeShape(cardTheme[member]) }).toEqual({
        member,
        shape: { bg: 'string', fg: 'string', shadow: 'string', kicker: 'string' },
      });
    }
  });

  it('makes every string leaf of colors, including neutral.*, a hex or rgba() color', () => {
    const leaves = collectStringLeaves(colors, '');

    expect(leaves.map(([path]) => path)).toEqual(
      expect.arrayContaining(['paper', 'divider', 'neutral.300', 'neutral.900']),
    );
    for (const [path, value] of leaves) {
      expect({ path, matches: HEX_COLOR.test(value) || RGBA_COLOR.test(value) }).toEqual({
        path,
        matches: true,
      });
    }
  });
});
