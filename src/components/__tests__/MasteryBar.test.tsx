import { render, screen } from '@testing-library/react-native';

import { border, colors } from '../../theme';
import { MasteryBar } from '../MasteryBar';
import { viewStyleOf } from '../testing/styles';

describe('MasteryBar', () => {
  it('fills to the value in its color, inside a 1-point ink border, 6 points tall', () => {
    render(<MasteryBar value={0.42} locked={false} color={colors.violet} />);

    expect(viewStyleOf(screen.getByTestId('mastery-bar'))).toMatchObject({
      height: 6,
      borderWidth: border.hairline,
      borderColor: colors.ink,
    });
    expect(viewStyleOf(screen.getByTestId('mastery-bar-fill'))).toMatchObject({
      flex: 42,
      backgroundColor: colors.violet,
    });
    expect(viewStyleOf(screen.getByTestId('mastery-bar-rest'))).toMatchObject({ flex: 58 });
  });

  it.each([
    [-0.5, 0],
    [1.7, 100],
    [Number.NaN, 0],
  ])('limits %p to %p percent', (value, percent) => {
    render(<MasteryBar value={value} locked={false} color={colors.lime} />);

    expect(viewStyleOf(screen.getByTestId('mastery-bar-fill'))).toMatchObject({ flex: percent });
  });

  it('shows no fill and a neutral border when locked', () => {
    render(<MasteryBar value={0.5} locked color={colors.lime} />);

    expect(screen.queryByTestId('mastery-bar-fill')).toBeNull();
    expect(viewStyleOf(screen.getByTestId('mastery-bar'))).toMatchObject({
      borderColor: colors.neutral[400],
    });
  });
});
