import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { CardFrame } from '../../components/CardFrame';
import { textStyleOf, viewStyleOf } from '../../components/testing/styles';
import type { Element } from '../../components/testing/styles';
import { cardTheme, colors, fonts, type } from '../../theme';
import type { CardType } from '../../theme';
import { ChoiceBody } from '../ChoiceBody';

type Props = ComponentProps<typeof ChoiceBody>;

// Values from docs/design/card-feed/README.md:59-85 and the prototype
// (reference/DoomSkill Card Feed v2.dc.html:106, 116, 130) that the theme does not hold.
const STACK = { gap: 8 };
const GRID = { gap: 8 };
const GRID_ROW = { flexDirection: 'row', gap: 8 };
const CELL = { flex: 1, minHeight: 62 };
const EMPTY_CELL = { flex: 1 };
const EXPLANATION = { ...type.body, fontSize: 14, lineHeight: 22 };

const OPTIONS = ['s("bd/4")', 's("bd*4")', 's("bd ~ bd ~")', 's("<bd bd>")'];
const WHY = '*4 repeats a step four times inside one cycle.';

const BASE: Omit<Props, 'onPick'> = {
  options: OPTIONS,
  correct: 1,
  picked: null,
  explanation: WHY,
  accent: colors.coral,
  layout: 'stack',
  mono: true,
};

let announce: jest.SpyInstance;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {
    // Nothing to announce to in a test.
  });
});

// React Native's Jest setup already makes the announce call a `jest.fn`: `mockRestore` clears its
// calls, and `restoreAllMocks` puts back a replaced `Platform.OS`.
afterEach(() => {
  announce.mockRestore();
  jest.restoreAllMocks();
});

/** Renders the body inside a frame of `frame`'s colors, as a card does. */
function renderBody(props: Partial<Props> = {}, frame: CardType = 'quiz') {
  const onPick = jest.fn<undefined, [number]>();
  const element = (next: Partial<Props>) => (
    <CardFrame type={frame} kicker="Quiz">
      <ChoiceBody {...BASE} onPick={onPick} {...props} {...next} />
    </CardFrame>
  );
  const view = render(element({}));
  const rerender = (next: Partial<Props>) => {
    view.rerender(element(next));
  };
  return { onPick, rerender };
}

const buttons = () => screen.getAllByRole('button');
const explanation = () => screen.queryByTestId('choice-explanation');

/**
 * What each option tells a screen reader: its spoken label, and whether it is locked or picked.
 * `Pressable` adds keys of its own to `accessibilityState`, so only these two are read.
 */
function spoken() {
  return buttons().map((button) => {
    const { disabled, selected } = button.props.accessibilityState as Record<string, unknown>;
    return { name: String(button.props.accessibilityLabel), state: { disabled, selected } };
  });
}

/** The fill of each option's face, in order. */
function fills(): unknown[] {
  return screen.getAllByTestId('option-face').map((face) => viewStyleOf(face).backgroundColor);
}

function childIds(element: Element): unknown[] {
  return element.children.map((child) =>
    typeof child === 'string' ? child : (child.props.testID as unknown),
  );
}

describe('ChoiceBody options', () => {
  it('shows every option, idle and pressable, before a pick', () => {
    renderBody();

    expect(spoken()).toStrictEqual(
      OPTIONS.map((name) => ({ name, state: { disabled: false, selected: false } })),
    );
    expect(fills()).toStrictEqual(OPTIONS.map(() => colors.paper));
    expect(screen.getAllByTestId('option-shadow')).toHaveLength(4);
  });

  it('calls onPick with the index of the pressed option', () => {
    const { onPick } = renderBody();

    fireEvent.press(screen.getByRole('button', { name: 's("bd ~ bd ~")' }));

    expect(onPick.mock.calls).toStrictEqual([[2]]);
  });

  it('after the right pick: that option correct and selected, the others locked', () => {
    renderBody({ picked: 1 });

    expect(spoken()).toStrictEqual([
      { name: 's("bd/4")', state: { disabled: true, selected: false } },
      { name: 's("bd*4"). Correct answer.', state: { disabled: true, selected: true } },
      { name: 's("bd ~ bd ~")', state: { disabled: true, selected: false } },
      { name: 's("<bd bd>")', state: { disabled: true, selected: false } },
    ]);
    expect(fills()).toStrictEqual(['transparent', colors.ink, 'transparent', 'transparent']);
    expect(screen.queryAllByTestId('option-shadow')).toHaveLength(0);
  });

  it('after a wrong pick: that option wrong and selected, and the correct one shown', () => {
    renderBody({ picked: 3 });

    expect(spoken()).toStrictEqual([
      { name: 's("bd/4")', state: { disabled: true, selected: false } },
      { name: 's("bd*4"). Correct answer.', state: { disabled: true, selected: false } },
      { name: 's("bd ~ bd ~")', state: { disabled: true, selected: false } },
      { name: 's("<bd bd>"). Not correct.', state: { disabled: true, selected: true } },
    ]);
    expect(screen.getByTestId('option-icon-wrong', { includeHiddenElements: true })).toBeTruthy();
  });

  it('colors the correct option with the accent it is given', () => {
    renderBody({ picked: 0, accent: cardTheme.predict.bg });

    expect(textStyleOf(screen.getByText('s("bd*4")')).color).toBe(colors.aqua);
  });

  it.each([
    { mono: true, fontFamily: fonts.mono },
    { mono: false, fontFamily: fonts.body },
  ])('sets the labels in $fontFamily when mono is $mono', ({ mono, fontFamily }) => {
    renderBody({ mono });

    for (const label of OPTIONS) {
      expect(textStyleOf(screen.getByText(label)).fontFamily).toBe(fontFamily);
    }
  });
});

describe('ChoiceBody layouts', () => {
  it('stack: the options one under another, 8 apart', () => {
    renderBody();
    const options = screen.getByTestId('choice-options');

    expect(viewStyleOf(options)).toStrictEqual(STACK);
    expect(within(options).getAllByRole('button')).toHaveLength(4);
    expect(screen.queryAllByTestId('choice-row')).toHaveLength(0);
    expect(screen.queryAllByTestId(/^choice-cell/)).toHaveLength(0);
  });

  it('grid: two equal columns, 8 apart, each cell at least 62 tall and holding one option', () => {
    renderBody({ layout: 'grid' });
    const rows = screen.getAllByTestId('choice-row');

    expect(viewStyleOf(screen.getByTestId('choice-options'))).toStrictEqual(GRID);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(viewStyleOf(row)).toStrictEqual(GRID_ROW);
      expect(childIds(row)).toStrictEqual(['choice-cell', 'choice-cell']);
    }
    const cells = screen.getAllByTestId('choice-cell');
    expect(cells.map(viewStyleOf)).toStrictEqual(OPTIONS.map(() => CELL));
    expect(cells.map((cell) => within(cell).getAllByRole('button').length)).toStrictEqual([
      1, 1, 1, 1,
    ]);
    expect(
      cells.map((cell) => String(within(cell).getByRole('button').props.accessibilityLabel)),
    ).toStrictEqual(OPTIONS);
  });

  it('grid with an odd count: the last option keeps half the width beside an empty cell', () => {
    renderBody({ layout: 'grid', options: OPTIONS.slice(0, 3) });
    const rows = screen.getAllByTestId('choice-row');

    expect(rows).toHaveLength(2);
    expect(rows.map(childIds)).toStrictEqual([
      ['choice-cell', 'choice-cell'],
      ['choice-cell', 'choice-cell-empty'],
    ]);
    expect(viewStyleOf(screen.getByTestId('choice-cell-empty'))).toStrictEqual(EMPTY_CELL);
    expect(within(screen.getByTestId('choice-cell-empty')).queryAllByRole('button')).toHaveLength(
      0,
    );
  });
});

describe('ChoiceBody option size', () => {
  it.each([
    { layout: 'stack' as const, justifyContent: 'space-between', icons: 2 },
    { layout: 'grid' as const, justifyContent: 'center', icons: 0 },
  ])('$layout: faces $justifyContent, $icons verdict icons', ({ layout, ...expected }) => {
    renderBody({ layout, picked: 0 });
    const faces = screen.getAllByTestId('option-face').map(viewStyleOf);

    expect(faces.map((face) => face.justifyContent)).toStrictEqual(
      OPTIONS.map(() => expected.justifyContent),
    );
    expect(screen.queryAllByTestId(/^option-icon/, { includeHiddenElements: true })).toHaveLength(
      expected.icons,
    );
  });
});

describe('ChoiceBody explanation', () => {
  it('is absent before a pick', () => {
    renderBody();

    expect(explanation()).toBeNull();
    expect(screen.queryByText(/Correct\.|Not quite\./)).toBeNull();
  });

  it('follows the options after the right pick, led by Correct. in bold, at 14 points', () => {
    renderBody({ picked: 1 });
    const text = screen.getByText(`Correct. ${WHY}`);

    // Queries return elements in tree order.
    const parts = within(screen.getByTestId('card-frame-body')).getAllByTestId(/^choice-/);
    expect(parts.map((part) => part.props.testID as unknown)).toStrictEqual([
      'choice-options',
      'choice-explanation',
    ]);
    expect(explanation()).toContainElement(text);
    expect(textStyleOf(text)).toStrictEqual({ ...EXPLANATION, color: colors.ink });
    const bold = screen.getAllByTestId('bold-span');
    expect(bold.map((span) => span.props.children as unknown)).toStrictEqual(['Correct.']);
    expect(bold[0] && textStyleOf(bold[0]).fontFamily).toBe(fonts.bodyBold);
  });

  it('is led by Not quite. in bold after a wrong pick', () => {
    renderBody({ picked: 0 });

    expect(screen.getByText(`Not quite. ${WHY}`)).toBeOnTheScreen();
    expect(screen.getByTestId('bold-span')).toHaveTextContent('Not quite.', { exact: true });
  });

  it('keeps bold marks inside the explanation, and takes the frame text color', () => {
    renderBody({ picked: 1, explanation: 'Wrap steps in **< >**.' }, 'exercise');
    const bold = screen.getAllByTestId('bold-span');

    expect(bold.map((span) => span.props.children as unknown)).toStrictEqual(['Correct.', '< >']);
    expect(textStyleOf(screen.getByText('Correct. Wrap steps in < >.')).color).toBe(colors.paper);
  });
});

describe('ChoiceBody explanation for screen readers', () => {
  it('is a polite live region, so Android reads it when it appears', () => {
    renderBody({ picked: 1 });

    expect(explanation()?.props.accessibilityLiveRegion).toBe('polite');
  });

  it('announces the verdict and explanation, without markers, on iOS when a pick shows it', () => {
    const { rerender } = renderBody({ explanation: 'Wrap steps in **< >**.' });
    expect(announce).not.toHaveBeenCalled();

    rerender({ picked: 2 });

    expect(announce.mock.calls).toStrictEqual([['Not quite. Wrap steps in < >.']]);
  });

  it('does not announce an answer that was already there when the card was drawn', () => {
    const { rerender } = renderBody({ picked: 1 });
    rerender({ picked: 1 });

    expect(explanation()).toBeOnTheScreen();
    expect(announce).not.toHaveBeenCalled();
  });

  it('leaves Android to the live region', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { rerender } = renderBody();

    rerender({ picked: 1 });

    expect(explanation()).toBeOnTheScreen();
    expect(announce).not.toHaveBeenCalled();
  });
});
