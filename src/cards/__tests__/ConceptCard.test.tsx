import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { Element } from '../../components/testing/styles';
import { cardSource, type ConceptCard as ConceptCardData } from '../../data';
import { cardsByType } from '../../feed/testing/sets';
import { border, colors, fonts, motion, type } from '../../theme';
import { ConceptCard } from '../ConceptCard';

// Values from docs/design/card-feed/README.md:55-57 and the prototype
// (reference/LearnLoop Card Feed v2.dc.html:87-91) that the theme does not hold.
const TILE_ROW = { flexDirection: 'row', gap: 6 };
const TILE = {
  flex: 1,
  borderWidth: border.strong,
  borderColor: colors.ink,
  padding: 8,
  gap: 2,
};
const LIFTED = { backgroundColor: colors.paper, transform: [{ translateY: -3 }] };
const NOTE = { fontFamily: fonts.heading, fontSize: 24, lineHeight: 37 };

const THREE_CYCLES: ConceptCardData = { ...cardsByType.concept, cycles: ['c3', 'e3', 'g3'] };

/** Renders the card, inactive unless asked, so tests that do not watch the timer start none. */
function renderCard(card: ConceptCardData = THREE_CYCLES, active = false) {
  const onNext = jest.fn<undefined, []>();
  const view = render(<ConceptCard card={card} active={active} onNext={onNext} />);
  const rerender = (nextActive: boolean) => {
    view.rerender(<ConceptCard card={card} active={nextActive} onNext={onNext} />);
  };
  return { onNext, rerender, unmount: view.unmount };
}

function tiles(): Element[] {
  return screen.getAllByTestId('cycle-tile');
}

/** The indexes of the tiles drawn highlighted: paper fill, lifted 3 points. */
function highlighted(): number[] {
  return tiles().flatMap((tile, index) =>
    viewStyleOf(tile).backgroundColor === colors.paper ? [index] : [],
  );
}

const A11Y_PROPS = [
  'accessible',
  'accessibilityRole',
  'accessibilityLiveRegion',
  'accessibilityState',
] as const;

/**
 * The accessibility props an element sets, and no others. Comparing a picked object keeps a
 * failure's diff small: printing a whole `props` object, children included, ran out of memory.
 */
function a11yOf(element: Element): Record<string, unknown> {
  const props: Record<string, unknown> = { ...(element.props as Record<string, unknown>) };
  return Object.fromEntries(
    A11Y_PROPS.filter((name) => props[name] !== undefined).map((name) => [name, props[name]]),
  );
}

function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

/** Every element under `root`, depth first: the order a reader meets them. */
function treeOrder(root: Element): Element[] {
  return [
    root,
    ...root.children.flatMap((child) => (typeof child === 'string' ? [] : treeOrder(child))),
  ];
}

// The demo concept card, read once through the data boundary (rule SS-6).
let demo: ConceptCardData = THREE_CYCLES;

beforeAll(async () => {
  const set = await cardSource.getNextSet();
  const card = set?.cards.find((item): item is ConceptCardData => item.type === 'concept');
  if (!card) throw new Error('The bundled source served no concept card');
  demo = card;
});

describe('ConceptCard content, from the demo card (README.md:51-57)', () => {
  it('shows the kicker and estimate in the kicker style, which uppercases them', () => {
    renderCard(demo);

    for (const text of ['Concept · Mini-notation', '~40 s']) {
      expect(textStyleOf(screen.getByText(text))).toMatchObject({ textTransform: 'uppercase' });
    }
  });

  it('shows the title as a large card title and a header', () => {
    renderCard(demo);
    const title = screen.getByRole('header', { name: 'Alternate with angle brackets' });

    expect(textStyleOf(title)).toMatchObject(type.cardTitleL);
  });

  it('shows the body with < > bold and no markers', () => {
    renderCard(demo);
    const [bold, ...others] = screen.getAllByTestId('bold-span');

    expect(screen.getByText(/^Wrap steps in < > and Strudel plays one of them/)).toBeOnTheScreen();
    expect(others).toHaveLength(0);
    expect(bold).toHaveTextContent('< >', { exact: true });
    expect(bold && textStyleOf(bold).fontFamily).toBe(fonts.bodyBold);
  });

  it('shows the code and its comment in the code block', () => {
    renderCard(demo);
    const block = screen.getByTestId('code-block');

    expect(within(block).getByTestId('code-block-code')).toHaveTextContent('note("<c3 e3 g3>")');
    expect(within(block).getByTestId('code-block-comment')).toHaveTextContent(
      '// cycle 1 → c3 · 2 → e3 · 3 → g3',
    );
  });

  it('lays out kicker, title, body, code, tiles, a flex spacer, then the button', () => {
    renderCard(demo);
    const order = treeOrder(screen.getByTestId('card-frame-body'));
    const parts = [
      screen.getByText('Concept · Mini-notation'),
      screen.getByRole('header'),
      screen.getByTestId('bold-span'),
      screen.getByTestId('code-block'),
      screen.getByTestId('cycle-tiles'),
      screen.getByTestId('concept-spacer'),
      screen.getByRole('button', { name: 'Got it' }),
    ].map((part) => order.indexOf(part));

    expect(parts.every((position) => position >= 0)).toBe(true);
    expect([...parts].sort((a, b) => a - b)).toStrictEqual(parts);
    expect(viewStyleOf(screen.getByTestId('concept-spacer'))).toStrictEqual({ flex: 1 });
  });
});

describe('ConceptCard cycle tiles', () => {
  it('draws one tile per cycle in a row, labelled Cycle 1 to 3, with each note', () => {
    renderCard(demo);

    expect(viewStyleOf(screen.getByTestId('cycle-tiles'))).toStrictEqual(TILE_ROW);
    expect(tiles()).toHaveLength(3);
    (
      [
        ['Cycle 1', 'c3'],
        ['Cycle 2', 'e3'],
        ['Cycle 3', 'g3'],
      ] as const
    ).forEach(([label, note], index) => {
      const tile = tiles()[index];
      expect(tile).toContainElement(screen.getByText(label));
      expect(tile).toContainElement(screen.getByText(note));
      expect(textStyleOf(screen.getByText(label))).toStrictEqual({
        ...type.kicker,
        color: colors.ink,
      });
      expect(textStyleOf(screen.getByText(note))).toStrictEqual({ ...NOTE, color: colors.ink });
    });
  });

  it.each([2, 3, 4])('draws %i equal tiles for that many cycles', (count) => {
    const cycles = ['c3', 'e3', 'g3', 'b3'].slice(0, count);
    renderCard({ ...THREE_CYCLES, cycles });

    expect(tiles()).toHaveLength(count);
    expect(tiles().map((tile) => viewStyleOf(tile))).toStrictEqual(
      cycles.map((_note, index) => (index === 0 ? { ...TILE, ...LIFTED } : TILE)),
    );
  });

  it('reads the tiles as one text group, with no live region and nothing pressable', () => {
    renderCard();
    const group = screen.getByTestId('cycle-tiles');

    expect(a11yOf(group)).toStrictEqual({ accessible: true, accessibilityRole: 'text' });
    expect(within(group).queryAllByRole('button')).toHaveLength(0);
    expect(tiles().map(a11yOf)).toStrictEqual(tiles().map(() => ({})));
  });
});

describe('ConceptCard button', () => {
  it('calls onNext once when Got it is pressed', () => {
    const { onNext } = renderCard();

    fireEvent.press(screen.getByRole('button', { name: 'Got it' }));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(viewStyleOf(screen.getByTestId('primary-button-face')).backgroundColor).toBe(colors.ink);
  });
});

describe('ConceptCard highlight timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('moves the highlight every 900 ms and loops back to the first tile', () => {
    renderCard(THREE_CYCLES, true);
    expect(motion.conceptCycle).toBe(900);
    expect(jest.getTimerCount()).toBe(1);
    expect(highlighted()).toStrictEqual([0]);

    advance(899);
    expect(highlighted()).toStrictEqual([0]);
    advance(1);
    expect(highlighted()).toStrictEqual([1]);
    advance(900);
    expect(highlighted()).toStrictEqual([2]);
    advance(900);
    expect(highlighted()).toStrictEqual([0]);
    const [first] = tiles();
    expect(first && viewStyleOf(first)).toMatchObject(LIFTED);
  });

  it('runs no timer while inactive and keeps the first tile highlighted', () => {
    renderCard(THREE_CYCLES, false);

    expect(jest.getTimerCount()).toBe(0);
    advance(2700);
    expect(highlighted()).toStrictEqual([0]);
  });

  it('clears the timer and returns to the first tile when it becomes inactive', () => {
    const { rerender } = renderCard(THREE_CYCLES, true);
    advance(900);
    expect(highlighted()).toStrictEqual([1]);

    rerender(false);
    expect(jest.getTimerCount()).toBe(0);
    expect(highlighted()).toStrictEqual([0]);

    rerender(true);
    expect(jest.getTimerCount()).toBe(1);
    expect(highlighted()).toStrictEqual([0]);
    advance(900);
    expect(highlighted()).toStrictEqual([1]);
  });

  it('clears the timer when the card is removed', () => {
    const { unmount } = renderCard(THREE_CYCLES, true);
    expect(jest.getTimerCount()).toBe(1);

    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('runs no timer for a single cycle', () => {
    renderCard(cardsByType.concept, true);

    expect(tiles()).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(highlighted()).toStrictEqual([0]);
  });

  it.each([
    [2, [1, 0, 1]],
    [4, [1, 2, 3, 0]],
  ])('wraps with %i cycles', (count, steps) => {
    renderCard({ ...THREE_CYCLES, cycles: ['c3', 'e3', 'g3', 'b3'].slice(0, count) }, true);

    for (const step of steps) {
      advance(900);
      expect(highlighted()).toStrictEqual([step]);
    }
  });
});
