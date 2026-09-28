import { render, screen, within } from '@testing-library/react-native';

import { border, cardTheme, colors, fonts } from '../../theme';
import { RubricList } from '../RubricList';
import { textStyleOf, viewStyleOf } from '../testing/styles';

const HIDDEN = { includeHiddenElements: true };
const ITEMS = [
  { label: 'Kick drum (bd) present', passed: true },
  { label: 'Snare or clap (sd / cp) present', passed: false },
  { label: 'Hi-hats keep time (hh)', passed: null },
];

const rows = () => screen.getAllByTestId('rubric-row');

/** The element at `index` of `list`; throws when there is none. */
function at<Item>(list: Item[], index: number): Item {
  const item = list[index];
  if (item === undefined) throw new Error(`Nothing at ${String(index)}`);
  return item;
}

const boxOf = (row: number) => within(at(rows(), row)).getByTestId('rubric-box', HIDDEN);
const labelOf = (row: number) => screen.getByText(at(ITEMS, row).label);
const checks = () => screen.queryAllByTestId('rubric-check', HIDDEN);

/** The fields of a row's `accessibilityState` the list sets. */
function stateOf(row: number) {
  const state = (at(rows(), row).props as { accessibilityState?: object }).accessibilityState;
  const { checked, disabled } = state as { checked?: unknown; disabled?: unknown };
  return { checked, disabled };
}

describe('RubricList layout', () => {
  it('sits under a 1.5 ink rule, one row per item in order', () => {
    render(<RubricList items={ITEMS} />);

    expect(viewStyleOf(screen.getByTestId('rubric-list'))).toMatchObject({
      borderTopWidth: border.strong,
      borderTopColor: cardTheme.checkpoint.fg,
    });
    expect(rows()).toHaveLength(3);
    ITEMS.forEach((item, row) => {
      expect(rows()[row]).toHaveTextContent(item.label);
    });
  });

  it('lays each row out as the prototype: 10 gap, 6 padding, 13.5 text, a 1pt ink line at 30%', () => {
    render(<RubricList items={ITEMS} />);

    expect(viewStyleOf(at(rows(), 0))).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    });
    expect(textStyleOf(labelOf(0))).toMatchObject({
      fontFamily: fonts.body,
      fontSize: 13.5,
      lineHeight: 21,
      color: cardTheme.checkpoint.fg,
    });
    const lines = screen.getAllByTestId('rubric-line');
    expect(lines).toHaveLength(3);
    expect(viewStyleOf(at(lines, 2))).toStrictEqual({
      height: border.hairline,
      backgroundColor: cardTheme.checkpoint.fg,
      opacity: 0.3,
    });
  });

  it('draws an 18 point box with a 1.5 ink border', () => {
    render(<RubricList items={ITEMS} />);

    expect(viewStyleOf(boxOf(2))).toMatchObject({
      width: 18,
      height: 18,
      borderWidth: border.strong,
      borderColor: cardTheme.checkpoint.fg,
      alignItems: 'center',
      justifyContent: 'center',
    });
  });
});

describe('RubricList states', () => {
  it('not graded: an empty box, the label as written', () => {
    render(<RubricList items={[{ label: 'Hi-hats keep time (hh)', passed: null }]} />);

    expect(viewStyleOf(boxOf(0)).backgroundColor).toBeUndefined();
    expect(checks()).toHaveLength(0);
    expect(
      textStyleOf(screen.getByText('Hi-hats keep time (hh)')).textDecorationLine,
    ).toBeUndefined();
  });

  it('passed: the box filled ink with a 12 point pink check, stroke 1.5, README.md:138', () => {
    render(<RubricList items={ITEMS} />);

    expect(viewStyleOf(boxOf(0)).backgroundColor).toBe(cardTheme.checkpoint.fg);
    expect(checks()).toHaveLength(1);
    const check = within(boxOf(0)).getByTestId('rubric-check', HIDDEN);
    expect(cardTheme.checkpoint.bg).toBe(colors.pink);
    expect(check.props).toMatchObject({
      width: 12,
      height: 12,
      stroke: colors.pink,
      strokeWidth: 1.5,
    });
    // The stroke is not scaled with the icon, so it stays 1.5 points at 12 points.
    // react-native-svg sends `vectorEffect="non-scaling-stroke"` to the native path as 1.
    const paths = check.findAll((node) => String(node.type) === 'RNSVGPath');
    expect(paths.map((path) => path.props.vectorEffect as unknown)).toStrictEqual([1]);
    expect(textStyleOf(labelOf(0)).textDecorationLine).toBeUndefined();
  });

  it('failed: an empty box and the label struck through, README.md:138', () => {
    render(<RubricList items={ITEMS} />);

    expect(viewStyleOf(boxOf(1)).backgroundColor).toBeUndefined();
    expect(within(boxOf(1)).queryAllByTestId('rubric-check', HIDDEN)).toHaveLength(0);
    expect(textStyleOf(labelOf(1)).textDecorationLine).toBe('line-through');
  });
});

describe('RubricList accessibility', () => {
  it('makes each row one checkbox the learner cannot toggle, checked only when passed', () => {
    render(<RubricList items={ITEMS} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect([0, 1, 2].map(stateOf)).toStrictEqual([
      { checked: true, disabled: true },
      { checked: false, disabled: true },
      { checked: false, disabled: true },
    ]);
  });

  it('speaks each row as its label and its state', () => {
    render(<RubricList items={ITEMS} />);

    expect(rows().map((row) => row.props.accessibilityLabel as unknown)).toStrictEqual([
      'Kick drum (bd) present. Passed.',
      'Snare or clap (sd / cp) present. Not met.',
      'Hi-hats keep time (hh). Not graded yet.',
    ]);
    for (const row of rows()) expect(row.props.accessible).toBe(true);
  });

  it('hides the check icon from accessibility', () => {
    render(<RubricList items={ITEMS} />);

    expect(screen.queryByTestId('rubric-check')).toBeNull();
    expect(checks()[0]?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});
