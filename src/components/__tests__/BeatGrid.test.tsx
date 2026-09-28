import { render, screen, within } from '@testing-library/react-native';

import { copy } from '../../copy';
import { type GridRow, parseGrid } from '../../feed/exercise';
import { colors, fonts, gridRowColors } from '../../theme';
import { BeatGrid } from '../BeatGrid';
import { type Element, textStyleOf, viewStyleOf } from '../testing/styles';

// The demo exercise's starting code, docs/design/card-feed/README.md:90-96.
const DEMO_CODE = 'stack(\n  s("bd ~ sd ~"),\n  s("hh*4")\n)';
const DEMO_ROWS = parseGrid(DEMO_CODE);

// Values from README.md:98-100 and, where it is silent, the prototype
// reference/LearnLoop Card Feed v2.dc.html:151-154. The line height is 10 times the body line
// height, 1.55, from reference/_ds/industry-be146a4e-adb2-4c13-8c51-8590a0cfc099/styles.css:108.
const LABEL_STYLE = { width: 26, fontFamily: fonts.mono, fontSize: 10, lineHeight: 15.5 };
const ROW_STYLE = { flexDirection: 'row', alignItems: 'center', gap: 2 };
const GRID_STYLE = { gap: 4, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12 };

type Look = { backgroundColor: unknown; opacity: unknown; transform: unknown };
const hitLook = (color: string): Look => ({
  backgroundColor: color,
  opacity: undefined,
  transform: undefined,
});
const EMPTY: Look = { backgroundColor: colors.paper, opacity: 0.1, transform: undefined };
const PLAYHEAD_EMPTY: Look = { backgroundColor: colors.paper, opacity: 0.35, transform: undefined };
const PLAYHEAD_HIT: Look = {
  backgroundColor: colors.paper,
  opacity: undefined,
  transform: [{ scaleY: 1.4 }],
};

/** A row named `name` whose 16 steps are hit at `columns`. */
function gridRow(name: string, columns: number[]): GridRow {
  return { name, hits: Array.from({ length: 16 }, (_, step) => columns.includes(step)) };
}

const FIVE_ROWS = [
  gridRow('bd', [0, 5]),
  gridRow('sd', [4, 12]),
  gridRow('hh', [2, 5, 8]),
  gridRow('cp', [15]),
  gridRow('oh', [1, 3]),
];

const rowsShown = () => screen.queryAllByTestId('beat-grid-row');
const labelsShown = () => screen.queryAllByTestId('beat-grid-label');

/** Asserts the drawn labels read `names`, in order. */
function expectLabels(names: string[]): void {
  const labels = labelsShown();
  expect(labels).toHaveLength(names.length);
  names.forEach((name, index) => {
    expect(labels[index]).toHaveTextContent(name, { exact: true });
  });
}

function cellsOf(index: number): Element[] {
  const row = rowsShown()[index];
  return row ? within(row).getAllByTestId('beat-grid-cell') : [];
}

function lookOf(cell: Element): Look {
  const { backgroundColor, opacity, transform } = viewStyleOf(cell);
  return { backgroundColor, opacity, transform };
}

/** The looks of row `index` with no playhead: its color on hits, faint paper elsewhere. */
function stoppedLooks(row: GridRow, index: number): Look[] {
  const color = gridRowColors[index] ?? colors.paper;
  return Array.from({ length: 16 }, (_, step) => (row.hits[step] ? hitLook(color) : EMPTY));
}

describe('BeatGrid rows', () => {
  it('draws one line per demo row: a label, then 16 cells', () => {
    render(<BeatGrid rows={DEMO_ROWS} step={null} />);

    expect(DEMO_ROWS.map(({ name }) => name)).toStrictEqual(['bd', 'sd', 'hh']);
    expect(rowsShown()).toHaveLength(3);
    expectLabels(['bd', 'sd', 'hh']);
    DEMO_ROWS.forEach((_, index) => {
      expect(cellsOf(index)).toHaveLength(16);
    });
  });

  it('sizes the label, the row and the cells as the design does', () => {
    render(<BeatGrid rows={DEMO_ROWS} step={null} />);
    const [label] = labelsShown();
    const [row] = rowsShown();
    const [cell] = cellsOf(0);

    expect(label && textStyleOf(label)).toMatchObject(LABEL_STYLE);
    expect(label).toHaveProp('numberOfLines', 1);
    expect(row && viewStyleOf(row)).toMatchObject(ROW_STYLE);
    expect(cell && viewStyleOf(cell)).toMatchObject({ flex: 1, height: 14 });
    expect(viewStyleOf(screen.getByTestId('beat-grid'))).toMatchObject(GRID_STYLE);
  });

  it.each(gridRowColors.map((color, index) => [index, color] as const))(
    'colors row %i label and hits %s, and its empty cells paper at 10%%',
    (index, color) => {
      render(<BeatGrid rows={FIVE_ROWS} step={null} />);
      const label = labelsShown()[index];
      const row = FIVE_ROWS[index];

      expect(label && textStyleOf(label).color).toBe(color);
      expect(row && cellsOf(index).map(lookOf)).toStrictEqual(row && stoppedLooks(row, index));
    },
  );

  it('draws only the first four rows', () => {
    render(<BeatGrid rows={FIVE_ROWS} step={null} />);

    expect(rowsShown()).toHaveLength(4);
    expectLabels(['bd', 'sd', 'hh', 'cp']);
  });

  it('renders nothing for no rows', () => {
    render(<BeatGrid rows={[]} step={3} />);

    expect(screen.toJSON()).toBeNull();
  });

  it('draws a row hit on every step, and one hit on none', () => {
    const all = gridRow('hh', [...Array<number>(16).keys()]);
    render(<BeatGrid rows={[all, gridRow('bd', [])]} step={null} />);

    expect(cellsOf(0).map(lookOf)).toStrictEqual(Array<Look>(16).fill(hitLook(colors.lime)));
    expect(cellsOf(1).map(lookOf)).toStrictEqual(Array<Look>(16).fill(EMPTY));
  });

  it('draws exactly 16 cells from a short or a long hits array', () => {
    const short = { name: 'bd', hits: [true, false, true] };
    const long = { name: 'hh', hits: [...Array<boolean>(16).fill(false), true, true, true, true] };
    render(<BeatGrid rows={[short, long]} step={null} />);

    expect(cellsOf(0).map(lookOf)).toStrictEqual(stoppedLooks(gridRow('bd', [0, 2]), 0));
    expect(cellsOf(1).map(lookOf)).toStrictEqual(Array<Look>(16).fill(EMPTY));
  });

  it('keeps a long name on one line inside the label column', () => {
    const name = 'superlongsamplename';
    render(<BeatGrid rows={[gridRow(name, [0])]} step={null} />);
    const [label] = labelsShown();

    expectLabels([name]);
    expect(label).toHaveProp('numberOfLines', 1);
    expect(label).toHaveProp('ellipsizeMode', 'clip');
    expect(label && textStyleOf(label).width).toBe(26);
    expect(cellsOf(0)).toHaveLength(16);
  });
});

describe('BeatGrid playhead', () => {
  const PLAYED = FIVE_ROWS.slice(0, 4);

  it('shows no playhead while stopped', () => {
    render(<BeatGrid rows={PLAYED} step={null} />);

    PLAYED.forEach((row, index) => {
      expect(cellsOf(index).map(lookOf)).toStrictEqual(stoppedLooks(row, index));
    });
  });

  it.each([5, 21, -11, 5.5])(
    'at step %p lights column 5 of every row and leaves the other columns alone',
    (step) => {
      render(<BeatGrid rows={PLAYED} step={step} />);

      PLAYED.forEach((row, index) => {
        const expected = stoppedLooks(row, index);
        expected[5] = row.hits[5] ? PLAYHEAD_HIT : PLAYHEAD_EMPTY;
        expect(cellsOf(index).map(lookOf)).toStrictEqual(expected);
      });
      // Rows 0 and 2 hit step 5; rows 1 and 3 do not, so both playhead looks are covered.
      expect(PLAYED.map((row) => row.hits[5])).toStrictEqual([true, false, true, false]);
    },
  );

  it.each([NaN, Infinity])('shows no playhead at step %p', (step) => {
    render(<BeatGrid rows={PLAYED} step={step} />);

    PLAYED.forEach((row, index) => {
      expect(cellsOf(index).map(lookOf)).toStrictEqual(stoppedLooks(row, index));
    });
  });
});

describe('BeatGrid accessibility', () => {
  it('is one image labelled with each demo row and its hits', () => {
    render(<BeatGrid rows={DEMO_ROWS} step={4} />);
    const grid = screen.getByTestId('beat-grid');
    const expected = copy.gridLabel(
      DEMO_ROWS.map(({ name, hits }) => copy.gridRow(name, hits.filter(Boolean).length)),
    );

    expect(screen.getAllByRole('image')).toHaveLength(1);
    expect(grid).toHaveProp('accessible', true);
    expect(grid).toHaveProp('accessibilityRole', 'image');
    expect(grid).toHaveProp('accessibilityLabel', expected);
    expect(grid).toHaveProp('accessibilityLabel', 'Beat grid. bd: 1 hit. sd: 1 hit. hh: 4 hits');
  });

  it('counts only the hits it draws, and leaves out a fifth row', () => {
    const long = { name: 'hh', hits: Array<boolean>(20).fill(true) };
    render(<BeatGrid rows={[long, ...FIVE_ROWS.slice(1)]} step={null} />);

    expect(screen.getByTestId('beat-grid')).toHaveProp(
      'accessibilityLabel',
      'Beat grid. hh: 16 hits. sd: 2 hits. hh: 3 hits. cp: 1 hit',
    );
  });
});

describe('BeatGrid rendering work', () => {
  /** The props object of each drawn row's view; React keeps it when a row is not re-rendered. */
  const rowProps = (): unknown[] => rowsShown().map((row) => row.props);

  it('does not re-render a row whose row, color and playhead did not change', () => {
    const first = gridRow('bd', [0]);
    const { rerender } = render(<BeatGrid rows={[first, gridRow('sd', [8])]} step={3} />);
    const [firstBefore, secondBefore] = rowProps();

    rerender(<BeatGrid rows={[first, gridRow('sd', [4])]} step={3} />);
    const [firstAfter, secondAfter] = rowProps();

    expect(firstAfter === firstBefore).toBe(true);
    expect(secondAfter === secondBefore).toBe(false);
  });

  it('re-renders every row when the step moves', () => {
    const rows = [gridRow('bd', [0]), gridRow('sd', [8])];
    const { rerender } = render(<BeatGrid rows={rows} step={3} />);
    const before = rowProps();

    rerender(<BeatGrid rows={rows} step={4} />);

    expect(rowProps().map((props, index) => props === before[index])).toStrictEqual([false, false]);
  });
});
