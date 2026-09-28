import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { copy } from '../../copy';
import { colors, type } from '../../theme';
import { CardFrame } from '../CardFrame';
import { PrimaryButton } from '../PrimaryButton';
import { textStyleOf, viewStyleOf } from '../testing/styles';
import type { Element } from '../testing/styles';

type Variant = 'ink' | 'paper' | 'lime';

// Fill and text per variant, README.md:49. The lime text color is the prototype's ink.
const VARIANTS: readonly { variant: Variant; fill: string; text: string }[] = [
  { variant: 'ink', fill: colors.ink, text: colors.paper },
  { variant: 'paper', fill: colors.paper, text: colors.ink },
  { variant: 'lime', fill: colors.lime, text: colors.ink },
];

function renderButton(props: { variant?: Variant; disabled?: boolean } = {}) {
  const onPress = jest.fn();
  render(<PrimaryButton label={copy.gotIt} onPress={onPress} {...props} />);
  return { onPress, button: screen.getByRole('button', { name: 'Got it' }) };
}

/**
 * The button draws only its face and its corner marks: no hard shadow view (README.md:18 and 49
 * give the primary button none).
 */
function expectNoShadow(button: Element) {
  // Pressable also adds a PressabilityDebugView, which renders nothing outside its debug mode.
  const drawn = button.children.filter(
    (child) => typeof child !== 'string' && child.children.length,
  );
  expect(drawn).toHaveLength(2);
  expect(button).toContainElement(screen.getByTestId('primary-button-face'));
  expect(button).toContainElement(
    screen.getByTestId('corner-marks', { includeHiddenElements: true }),
  );
}

/** A touch at the origin, shaped like the responder events React Native sends. */
function touchEvent() {
  const touch = { identifier: 0, locationX: 0, locationY: 0, pageX: 0, pageY: 0, target: 0 };
  return {
    persist: () => undefined,
    currentTarget: { measure: () => undefined },
    nativeEvent: { ...touch, timestamp: Date.now(), touches: [], changedTouches: [touch] },
  };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('PrimaryButton look', () => {
  it('shows its label and calls onPress once when pressed', () => {
    const { onPress, button } = renderButton();

    fireEvent.press(button);

    expect(within(button).getByText('Got it')).toBeOnTheScreen();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(VARIANTS)('fills the $variant variant and colors its text', ({ variant, fill, text }) => {
    renderButton({ variant });

    expect(viewStyleOf(screen.getByTestId('primary-button-face')).backgroundColor).toBe(fill);
    expect(textStyleOf(screen.getByText('Got it'))).toMatchObject({
      ...type.button,
      color: text,
    });
  });

  it('defaults to the ink variant', () => {
    renderButton();

    expect(viewStyleOf(screen.getByTestId('primary-button-face')).backgroundColor).toBe(colors.ink);
    expect(textStyleOf(screen.getByText('Got it')).color).toBe(colors.paper);
  });

  it('is full width, 50 points tall and at least 44, with no hard shadow at rest', () => {
    const { button } = renderButton();

    expect(viewStyleOf(button)).toMatchObject({ alignSelf: 'stretch', height: 50 });
    expect(viewStyleOf(button).height).toBeGreaterThanOrEqual(44);
    expect(viewStyleOf(button).transform).toBeUndefined();
    expectNoShadow(button);
  });

  it('has four corner marks, hidden from accessibility', () => {
    const { button } = renderButton();
    const hidden = { includeHiddenElements: true };

    expect(within(button).getAllByTestId('corner-mark', hidden)).toHaveLength(4);
    expect(within(button).queryAllByTestId('corner-mark')).toHaveLength(0);
  });

  // A control's marks follow the card text color, unlike the frame's own marks, which are ink on
  // every card: on the ink-ground exercise and summary cards they sit over the ink and show paper.
  it.each([
    { cardType: 'concept', color: colors.ink, colorName: 'ink' },
    { cardType: 'exercise', color: colors.paper, colorName: 'paper' },
    { cardType: 'summary', color: colors.paper, colorName: 'paper' },
  ] as const)(
    'draws its corner marks in $colorName inside the $cardType frame',
    ({ cardType, color }) => {
      render(
        <CardFrame type={cardType} kicker="Kicker">
          <PrimaryButton label={copy.nextCard} onPress={jest.fn()} />
        </CardFrame>,
      );
      const button = screen.getByRole('button', { name: 'Next card' });
      const hidden = { includeHiddenElements: true };
      const layer = within(button).getByTestId('corner-marks', hidden);
      const lines = within(button).getAllByTestId('corner-mark-line', hidden);

      expect(layer.props).toMatchObject({
        pointerEvents: 'none',
        accessibilityElementsHidden: true,
      });
      expect(viewStyleOf(layer)).toMatchObject({ opacity: 0.55 });
      expect(lines).toHaveLength(8);
      for (const line of lines) {
        expect(viewStyleOf(line).backgroundColor).toBe(color);
      }
    },
  );
});

describe('PrimaryButton behavior', () => {
  it('moves 1 point right and down while pressed, and back when released', () => {
    jest.useFakeTimers();
    const { onPress, button } = renderButton();

    // Pressable tracks `pressed` through the responder events on its host view, the same events
    // userEvent.press sends; fireEvent(button, 'pressIn') would only call an onPressIn prop.
    fireEvent(button, 'responderGrant', touchEvent());

    expect(viewStyleOf(button).transform).toStrictEqual([{ translateX: 1 }, { translateY: 1 }]);
    expectNoShadow(button);

    fireEvent(button, 'responderRelease', touchEvent());
    // Pressability holds pressOut until a press has lasted its 130 ms minimum.
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(viewStyleOf(button).transform).toBeUndefined();
    expectNoShadow(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('when disabled: 45% opacity, onPress not called, accessibilityState.disabled true', () => {
    const { onPress, button } = renderButton({ disabled: true });

    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(viewStyleOf(button).opacity).toBe(0.45);
    expect(button.props).toMatchObject({ accessibilityState: { disabled: true } });
    expect(button).toBeDisabled();
  });

  it('when enabled: full opacity and accessibilityState.disabled false', () => {
    const { button } = renderButton();

    expect(viewStyleOf(button).opacity).toBeUndefined();
    expect(button.props).toMatchObject({ accessibilityState: { disabled: false } });
    expect(button).toBeEnabled();
  });

  it('exposes the button role and its label as the accessibility label', () => {
    render(<PrimaryButton label={copy.nextCard} onPress={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Next card' });

    expect(button.props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: 'Next card',
    });
  });
});
