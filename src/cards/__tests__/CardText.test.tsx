import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { CardFrame } from '../../components/CardFrame';
import { textStyleOf } from '../../components/testing/styles';
import { cardTheme, colors, fonts, type } from '../../theme';
import { CardBody, CardTitle } from '../CardText';

const TITLE = 'Alternate with angle brackets';
const BODY = 'Wrap steps in **< >** and Strudel plays one of them per cycle.';
const BODY_SHOWN = 'Wrap steps in < > and Strudel plays one of them per cycle.';

/** Renders `content` inside an exercise frame, whose text color is paper, not the ink default. */
function inExerciseFrame(content: ReactElement) {
  return render(
    <CardFrame type="exercise" kicker="Exercise · REPL">
      {content}
    </CardFrame>,
  );
}

describe('CardTitle', () => {
  it.each([
    ['l', type.cardTitleL],
    ['m', type.cardTitleM],
    ['s', type.cardTitleS],
  ] as const)('draws size %s in its theme title style', (size, style) => {
    render(<CardTitle size={size}>{TITLE}</CardTitle>);

    expect(textStyleOf(screen.getByText(TITLE))).toStrictEqual({ ...style, color: colors.ink });
  });

  it('takes its color from the enclosing card frame', () => {
    inExerciseFrame(<CardTitle size="s">{TITLE}</CardTitle>);

    expect(textStyleOf(screen.getByText(TITLE)).color).toBe(cardTheme.exercise.fg);
    expect(cardTheme.exercise.fg).not.toBe(colors.ink);
  });

  it('is a header to a screen reader', () => {
    render(<CardTitle size="l">{TITLE}</CardTitle>);

    expect(screen.getByRole('header', { name: TITLE })).toBe(screen.getByText(TITLE));
  });
});

describe('CardBody', () => {
  it('draws the text in the body style, ink outside a frame, with the markers removed', () => {
    render(<CardBody text={BODY} />);

    expect(textStyleOf(screen.getByText(BODY_SHOWN))).toStrictEqual({
      ...type.body,
      color: colors.ink,
    });
  });

  it('draws the text between a pair of markers bold', () => {
    render(<CardBody text={BODY} />);
    const [span, ...others] = screen.getAllByTestId('bold-span');

    expect(others).toHaveLength(0);
    expect(span).toHaveTextContent('< >', { exact: true });
    expect(span && textStyleOf(span).fontFamily).toBe(fonts.bodyBold);
  });

  it('takes its color from the enclosing card frame', () => {
    inExerciseFrame(<CardBody text={BODY} />);

    expect(textStyleOf(screen.getByText(BODY_SHOWN)).color).toBe(cardTheme.exercise.fg);
  });
});
