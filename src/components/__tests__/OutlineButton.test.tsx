import { fireEvent, render, screen } from '@testing-library/react-native';

import { holdDown, letGo } from '../../cards/testing/press';
import { colors, type } from '../../theme';
import { CardFrame } from '../CardFrame';
import { OutlineButton } from '../OutlineButton';
import { textStyleOf, viewStyleOf } from '../testing/styles';

/** Renders the button inside the Summary's frame (paper text) unless `framed` is false. */
function renderOutline(props: { disabled?: boolean } = {}, framed = true) {
  const onPress = jest.fn<undefined, []>();
  const button = <OutlineButton label="View skill tree" onPress={onPress} {...props} />;
  render(
    framed ? (
      <CardFrame type="summary" kicker="Day 4 complete">
        {button}
      </CardFrame>
    ) : (
      button
    ),
  );
  return { onPress, button: screen.getByRole('button', { name: 'View skill tree' }) };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('OutlineButton look', () => {
  it('is full width, 50 points tall, transparent, with a 1.5-point border in the card color', () => {
    const { button } = renderOutline();

    expect(viewStyleOf(button)).toMatchObject({
      alignSelf: 'stretch',
      height: 50,
      borderWidth: 1.5,
      borderColor: colors.paper,
      backgroundColor: 'transparent',
    });
    expect(viewStyleOf(button).opacity).toBeUndefined();
    expect(viewStyleOf(button).transform).toBeUndefined();
  });

  it('writes its label in the button style and the card color', () => {
    renderOutline();

    expect(textStyleOf(screen.getByText('View skill tree'))).toMatchObject({
      ...type.button,
      color: colors.paper,
    });
  });

  it('is ink outside any card frame', () => {
    const { button } = renderOutline({}, false);

    expect(viewStyleOf(button).borderColor).toBe(colors.ink);
    expect(textStyleOf(screen.getByText('View skill tree')).color).toBe(colors.ink);
  });
});

describe('OutlineButton behavior', () => {
  it('calls onPress once when pressed, and exposes its role, label and enabled state', () => {
    const { onPress, button } = renderOutline();

    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'View skill tree',
      accessibilityState: { disabled: false },
    });
  });

  it('moves 1 point right and down while pressed, and back when released', () => {
    jest.useFakeTimers();
    const { onPress, button } = renderOutline();

    holdDown(button);
    expect(viewStyleOf(button).transform).toStrictEqual([{ translateX: 1 }, { translateY: 1 }]);
    letGo(button);

    expect(viewStyleOf(button).transform).toBeUndefined();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('when disabled: 45% opacity, onPress not called, accessibilityState.disabled true', () => {
    const { onPress, button } = renderOutline({ disabled: true });

    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(viewStyleOf(button).opacity).toBe(0.45);
    expect(button.props).toMatchObject({ accessibilityState: { disabled: true } });
  });
});
