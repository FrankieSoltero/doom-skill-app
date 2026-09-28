import { render, screen } from '@testing-library/react-native';

import { colors, type } from '../../theme';
import { CardFrame } from '../CardFrame';
import { MasteryRow } from '../MasteryRow';
import { textStyleOf, viewStyleOf } from '../testing/styles';

const HIDDEN = { includeHiddenElements: true };

/** Renders a row inside the Summary's frame, whose text is paper. */
function renderRow(from: number, to: number, color: string = colors.violet) {
  render(
    <CardFrame type="summary" kicker="Day 4 complete">
      <MasteryRow name="Alternation < >" from={from} to={to} color={color} />
    </CardFrame>,
  );
}

describe('MasteryRow', () => {
  it('shows the name in the card color and the change in neutral 400, both small', () => {
    renderRow(0.42, 0.61);

    expect(textStyleOf(screen.getByText('Alternation < >'))).toMatchObject({
      ...type.small,
      color: colors.paper,
    });
    expect(textStyleOf(screen.getByText('0.42 → 0.61'))).toMatchObject({
      ...type.small,
      color: colors.neutral[400],
    });
  });

  it('draws a 6-point bar filled to its `to` value in its color', () => {
    renderRow(0.42, 0.61, colors.coral);

    expect(viewStyleOf(screen.getByTestId('mastery-bar')).height).toBe(6);
    expect(viewStyleOf(screen.getByTestId('mastery-bar')).flexDirection).toBe('row');
    expect(viewStyleOf(screen.getByTestId('mastery-fill', HIDDEN))).toMatchObject({
      flex: 61,
      backgroundColor: colors.coral,
    });
    expect(viewStyleOf(screen.getByTestId('mastery-rest', HIDDEN)).flex).toBe(39);
  });

  it('draws its track in paper at 15% opacity, behind the fill', () => {
    renderRow(0.42, 0.61);

    expect(viewStyleOf(screen.getByTestId('mastery-track', HIDDEN))).toMatchObject({
      backgroundColor: colors.paper,
      opacity: 0.15,
    });
  });

  it('is a progress bar to a screen reader, named after the node, valued in percent', () => {
    renderRow(0.42, 0.61);

    const bar = screen.getByRole('progressbar', { name: 'Alternation < > mastery' });
    expect(bar).toBe(screen.getByTestId('mastery-bar'));
    expect(bar.props).toHaveProperty('accessibilityValue', { min: 0, max: 100, now: 61 });
  });

  it.each([
    { to: 1.4, now: 100 },
    { to: -0.2, now: 0 },
    { to: 0.885, now: 89 },
    { to: Number.NaN, now: 0 },
  ])('limits a `to` of $to to the bar: $now of 100', ({ to, now }) => {
    renderRow(0, to);

    expect(viewStyleOf(screen.getByTestId('mastery-fill', HIDDEN)).flex).toBe(now);
    expect(viewStyleOf(screen.getByTestId('mastery-rest', HIDDEN)).flex).toBe(100 - now);
    expect(screen.getByTestId('mastery-bar').props).toHaveProperty('accessibilityValue', {
      min: 0,
      max: 100,
      now,
    });
  });
});
