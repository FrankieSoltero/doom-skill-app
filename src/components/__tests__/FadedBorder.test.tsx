import { render, screen } from '@testing-library/react-native';

import { border, colors } from '../../theme';
import { FadedBorder } from '../FadedBorder';
import { viewStyleOf } from '../testing/styles';

describe('FadedBorder', () => {
  it.each([0.25, 0.45])(
    'draws a 1 point paper border at %d over its parent, holding nothing',
    (opacity) => {
      render(<FadedBorder opacity={opacity} />);

      const edge = screen.getByTestId('faded-border');
      expect(viewStyleOf(edge)).toStrictEqual({
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        borderWidth: border.hairline,
        borderColor: colors.paper,
        opacity,
      });
      expect(edge.children).toHaveLength(0);
    },
  );

  it('ignores touches, so the content under it takes them', () => {
    render(<FadedBorder opacity={0.25} />);

    expect(screen.getByTestId('faded-border').props).toHaveProperty('pointerEvents', 'none');
  });
});
