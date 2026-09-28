import { render, screen } from '@testing-library/react-native';

import { colors, type } from '../../theme';
import { StatTile } from '../StatTile';
import { textStyleOf, viewStyleOf } from '../testing/styles';

describe('StatTile', () => {
  it('shows its value over its label, both in ink, on its fill', () => {
    render(<StatTile value="13" label="day streak" fill={colors.coral} />);

    const tile = screen.getByTestId('stat-tile');
    expect(tile).toHaveTextContent('13day streak');
    expect(viewStyleOf(tile)).toMatchObject({
      flex: 1,
      backgroundColor: colors.coral,
      paddingVertical: 10,
      paddingHorizontal: 12,
    });
    expect(textStyleOf(screen.getByText('13'))).toMatchObject({ ...type.stat, color: colors.ink });
    expect(textStyleOf(screen.getByText('day streak'))).toMatchObject({
      ...type.caption,
      color: colors.ink,
    });
  });

  it('takes any fill and any text as given', () => {
    render(<StatTile value="34%" label="topic progress, +3" fill={colors.aqua} />);

    expect(viewStyleOf(screen.getByTestId('stat-tile')).backgroundColor).toBe(colors.aqua);
    expect(screen.getByText('34%')).toBeOnTheScreen();
    expect(screen.getByText('topic progress, +3')).toBeOnTheScreen();
  });

  it('reads as one element to a screen reader', () => {
    render(<StatTile value="13" label="day streak" fill={colors.coral} />);

    expect(screen.getByTestId('stat-tile').props).toHaveProperty('accessible', true);
  });
});
