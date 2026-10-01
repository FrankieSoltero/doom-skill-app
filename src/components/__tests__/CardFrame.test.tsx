import { render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { FlagTarget } from '../../cards/FlagButton';
import { cardsByType } from '../../feed/testing/sets';
import { border, cardTheme, colors, hardShadow, type } from '../../theme';
import type { CardType } from '../../theme';
import { CardFrame } from '../CardFrame';
import { CardTextColorProvider, useCardTextColor } from '../cardTextColor';
import { CornerMarks } from '../CornerMarks';
import { textStyleOf, viewStyleOf } from '../testing/styles';
import type { Element } from '../testing/styles';

const CARD_TYPES: readonly CardType[] = [
  'concept',
  'quiz',
  'predict',
  'exercise',
  'review',
  'checkpoint',
  'summary',
];

const KICKER = 'Concept · Mini-notation';
const META = '~40 s';

// Corner marks: 11 by 11, offset -6 so each is centred on its corner (README.md:19).
const MARK_SIZE = { position: 'absolute', width: 11, height: 11 };
const CORNERS = [
  { top: -6, left: -6 },
  { top: -6, right: -6 },
  { bottom: -6, left: -6 },
  { bottom: -6, right: -6 },
];

function renderFrame(cardType: CardType = 'concept', meta: string | null = META) {
  return render(
    <CardFrame type={cardType} kicker={KICKER} {...(meta === null ? {} : { meta })}>
      <Text>body</Text>
    </CardFrame>,
  );
}

/** Renders the text color the nearest frame supplies, so a test can read it. */
function TextColorProbe() {
  return <Text testID="text-color">{useCardTextColor()}</Text>;
}

/** The corner-mark layer and its marks, which are hidden from accessibility. */
function cornerMarks() {
  const hidden = { includeHiddenElements: true };
  return {
    layer: screen.getByTestId('corner-marks', hidden),
    marks: screen.getAllByTestId('corner-mark', hidden),
  };
}

/** Both elements sit inside the frame and neither is inside the other. */
function expectSiblings(first: Element, second: Element) {
  const frame = screen.getByTestId('card-frame');
  expect(frame).toContainElement(first);
  expect(frame).toContainElement(second);
  expect(first).not.toContainElement(second);
  expect(second).not.toContainElement(first);
}

describe('CardFrame colors and shadow', () => {
  it.each(CARD_TYPES)('colors the %s frame from cardTheme', (cardType) => {
    renderFrame(cardType);
    const theme = cardTheme[cardType];

    expect(viewStyleOf(screen.getByTestId('card-frame-body'))).toMatchObject({
      backgroundColor: theme.bg,
      borderColor: colors.ink,
      borderWidth: border.strong,
    });
    expect(viewStyleOf(screen.getByTestId('card-frame-shadow')).backgroundColor).toBe(theme.shadow);
    expect(textStyleOf(screen.getByText(KICKER)).color).toBe(theme.kicker);
    expect(textStyleOf(screen.getByText(META)).color).toBe(theme.kicker);
  });

  it('draws the hard shadow as a sibling view offset right and down, with no blur', () => {
    renderFrame();
    const shadow = screen.getByTestId('card-frame-shadow');
    const body = screen.getByTestId('card-frame-body');
    const offset = hardShadow.card;

    expect(viewStyleOf(shadow)).toStrictEqual({
      position: 'absolute',
      top: offset,
      left: offset,
      right: -offset,
      bottom: -offset,
      backgroundColor: cardTheme.concept.shadow,
    });
    expectSiblings(shadow, body);
    for (const element of [shadow, body]) {
      expect(viewStyleOf(element)).not.toHaveProperty('shadowOpacity');
      expect(viewStyleOf(element)).not.toHaveProperty('shadowRadius');
      expect(viewStyleOf(element)).not.toHaveProperty('elevation');
    }
  });
});

describe('CardFrame corner marks', () => {
  it.each<CardType>(['concept', 'exercise', 'summary'])(
    'draws four 11 by 11 marks centred on the %s frame corners, hidden from touch and a11y',
    (cardType) => {
      renderFrame(cardType);
      const { layer, marks } = cornerMarks();

      expect(marks.map((mark) => viewStyleOf(mark))).toStrictEqual(
        CORNERS.map((corner) => ({ ...MARK_SIZE, ...corner })),
      );
      expectSiblings(layer, screen.getByTestId('card-frame-body'));
      expect(layer.props).toMatchObject({
        pointerEvents: 'none',
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
      });
      expect(screen.queryAllByTestId('corner-mark')).toHaveLength(0);
    },
  );

  // The frame's own marks are ink on every card, README.md:19, including the ink-ground exercise
  // and summary cards, where they sit half over the paper page. Marks drawn with the default tone,
  // as controls draw them, follow the card text color.
  it.each([
    {
      where: 'a concept frame',
      renderMarks: () => renderFrame('concept'),
      color: colors.ink,
      colorName: 'ink',
    },
    {
      where: 'an exercise frame',
      renderMarks: () => renderFrame('exercise'),
      color: colors.ink,
      colorName: 'ink',
    },
    {
      where: 'a summary frame',
      renderMarks: () => renderFrame('summary'),
      color: colors.ink,
      colorName: 'ink',
    },
    {
      where: 'default tone, no frame',
      renderMarks: () => render(<CornerMarks />),
      color: colors.ink,
      colorName: 'ink',
    },
    {
      where: 'default tone, paper text',
      renderMarks: () =>
        render(
          <CardTextColorProvider color={cardTheme.exercise.fg}>
            <CornerMarks />
          </CardTextColorProvider>,
        ),
      color: colors.paper,
      colorName: 'paper',
    },
  ])('draws each mark as two hairlines at 55% in $colorName for $where', (row) => {
    row.renderMarks();
    const { layer, marks } = cornerMarks();
    const lines = marks.flatMap((mark) =>
      within(mark)
        .getAllByTestId('corner-mark-line', { includeHiddenElements: true })
        .map((line) => viewStyleOf(line)),
    );
    const line = { position: 'absolute', backgroundColor: row.color };
    const vertical = { ...line, left: 5, top: 0, width: border.hairline, height: 11 };
    const horizontal = { ...line, top: 5, left: 0, width: 11, height: border.hairline };

    expect(viewStyleOf(layer)).toMatchObject({ opacity: 0.55 });
    expect(lines).toStrictEqual(marks.flatMap(() => [vertical, horizontal]));
    expect(lines).toHaveLength(8);
  });
});

describe('useCardTextColor', () => {
  it.each(CARD_TYPES)(
    'gives the %s frame text color from cardTheme to its children',
    (cardType) => {
      render(
        <CardFrame type={cardType} kicker={KICKER}>
          <TextColorProbe />
        </CardFrame>,
      );

      expect(screen.getByTestId('text-color')).toHaveTextContent(cardTheme[cardType].fg);
    },
  );

  it('gives ink outside any frame', () => {
    render(<TextColorProbe />);

    expect(screen.getByTestId('text-color')).toHaveTextContent(colors.ink);
  });

  it('gives the inner frame color inside a nested frame', () => {
    render(
      <CardFrame type="exercise" kicker={KICKER}>
        <CardFrame type="concept" kicker={KICKER}>
          <TextColorProbe />
        </CardFrame>
      </CardFrame>,
    );

    // The outer frame is paper and the inner one ink (the default), so neither "outermost wins"
    // nor "first non-default wins" can pass.
    expect(screen.getByTestId('text-color')).toHaveTextContent(cardTheme.concept.fg);
    expect(cardTheme.exercise.fg).not.toBe(cardTheme.concept.fg);
  });
});

describe('CardFrame kicker row and content', () => {
  it('lays out the kicker row: kicker left, meta right, both uppercase by style', () => {
    renderFrame();
    const row = screen.getByTestId('card-kicker-row');
    const kicker = screen.getByText(KICKER);
    const meta = screen.getByText(META);

    expect(viewStyleOf(row)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
    });
    const [left, right, ...rest] = within(row).getAllByText(/.+/);
    expect(left).toBe(kicker);
    expect(right).toBe(meta);
    expect(rest).toHaveLength(0);
    for (const text of [kicker, meta]) {
      expect(textStyleOf(text)).toMatchObject({ ...type.kicker, textTransform: 'uppercase' });
    }
  });

  it('renders the kicker alone, with no empty element, when meta is omitted', () => {
    renderFrame('concept', null);
    const row = screen.getByTestId('card-kicker-row');

    expect(screen.queryByText(META)).toBeNull();
    expect(row.children).toHaveLength(1);
    expect(row).toContainElement(screen.getByText(KICKER));
  });

  it('renders its children in the frame body, and the frame has no accessibility role', () => {
    renderFrame();
    const frame = screen.getByTestId('card-frame');

    expect(screen.getByTestId('card-frame-body')).toContainElement(screen.getByText('body'));
    expect(frame.props).not.toHaveProperty('accessibilityRole');
    expect(frame.props).not.toHaveProperty('role');
    expect(screen.getByText(KICKER)).toBeOnTheScreen();
    expect(screen.getByText(META)).toBeOnTheScreen();
  });
});

describe('CardFrame flag action with the demo sets', () => {
  it('shows no flag action: the demo cards have no API to send a flag to', () => {
    render(
      <FlagTarget card={{ ...cardsByType.quiz, id: '5d1f0c2e-7a3b-4c4d-9e5f-6a7b8c9d0e1f' }}>
        <CardFrame type="quiz" kicker={KICKER}>
          <Text>body</Text>
        </CardFrame>
      </FlagTarget>,
    );

    expect(screen.queryByRole('button', { name: 'Flag this card' })).toBeNull();
  });
});
