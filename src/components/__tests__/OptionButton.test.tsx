import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { border, colors, fonts, hardShadow, type } from '../../theme';
import { OptionButton, optionState } from '../OptionButton';
import type { OptionState } from '../OptionButton';
import { textStyleOf, viewStyleOf } from '../testing/styles';

const LABEL = 's("bd*4")';
const HIDDEN = { includeHiddenElements: true };

type Options = { state?: OptionState; mono?: boolean; picked?: boolean; compact?: boolean };

function renderOption(props: Options = {}) {
  const onPress = jest.fn();
  render(
    <OptionButton label={LABEL} state="idle" accent={colors.coral} onPress={onPress} {...props} />,
  );
  return { onPress, button: screen.getByRole('button') };
}

/**
 * The fields Pressability reads from a responder event. With no `touches`, it takes the touch
 * position from `nativeEvent` itself, and it skips the timestamp when there is none.
 */
const PRESS_EVENT = {
  persist: () => undefined,
  currentTarget: { measure: () => undefined },
  nativeEvent: { pageX: 0, pageY: 0 },
};

const face = () => screen.getByTestId('option-face');
const labelText = () => screen.getByText(LABEL);
const shadow = () => screen.queryByTestId('option-shadow');

afterEach(() => {
  jest.useRealTimers();
});

describe('optionState', () => {
  // A four-option question whose correct answer is index 1.
  it.each([
    { picked: null, expected: ['idle', 'idle', 'idle', 'idle'] },
    { picked: 1, expected: ['other', 'correct', 'other', 'other'] },
    { picked: 3, expected: ['other', 'correct', 'other', 'wrong'] },
  ])('picked $picked gives $expected', ({ picked, expected }) => {
    expect([0, 1, 2, 3].map((index) => optionState(index, picked, 1))).toStrictEqual(expected);
  });
});

describe('OptionButton looks', () => {
  it('idle: paper fill, 1.5 ink border, 52 tall, 14 padding and a 3 point ink shadow', () => {
    const { button } = renderOption();

    expect(viewStyleOf(face())).toMatchObject({
      backgroundColor: colors.paper,
      borderWidth: border.strong,
      borderColor: colors.ink,
      minHeight: 52,
      paddingHorizontal: 14,
    });
    expect(viewStyleOf(button).transform).toBeUndefined();
    expect(textStyleOf(labelText())).toMatchObject({ color: colors.ink });
    expect(textStyleOf(labelText()).textDecorationLine).toBeUndefined();
    expect(within(button).queryAllByTestId(/option-icon/, HIDDEN)).toHaveLength(0);
    const offset = hardShadow.option;
    expect(viewStyleOf(screen.getByTestId('option-shadow'))).toMatchObject({
      position: 'absolute',
      top: offset,
      left: offset,
      right: -offset,
      bottom: -offset,
      backgroundColor: colors.ink,
    });
  });

  it('correct: ink fill, accent text, scaled 1.02, a trailing check icon and no shadow', () => {
    const { button } = renderOption({ state: 'correct' });

    expect(viewStyleOf(face()).backgroundColor).toBe(colors.ink);
    expect(textStyleOf(labelText()).color).toBe(colors.coral);
    expect(viewStyleOf(button).transform).toStrictEqual([{ scale: 1.02 }]);
    expect(screen.getByTestId('option-icon-correct', HIDDEN).props).toMatchObject({
      width: 18,
      height: 18,
      stroke: colors.coral,
      strokeWidth: 1.5,
    });
    expect(shadow()).toBeNull();
  });

  it('wrong: transparent, 60% ink text struck through, a trailing X icon and no shadow', () => {
    const { button } = renderOption({ state: 'wrong' });

    expect(viewStyleOf(face()).backgroundColor).toBe('transparent');
    expect(textStyleOf(labelText())).toMatchObject({
      color: colors.ink,
      opacity: 0.6,
      textDecorationLine: 'line-through',
    });
    expect(viewStyleOf(button).transform).toBeUndefined();
    const icon = screen.getByTestId('option-icon-wrong', HIDDEN);
    expect(icon.props).toMatchObject({
      width: 18,
      height: 18,
      stroke: colors.ink,
      strokeWidth: 1.5,
    });
    // react-native-svg moves an Svg's `opacity` prop into its style.
    expect(viewStyleOf(icon).opacity).toBe(0.6);
    expect(shadow()).toBeNull();
  });

  it('other: transparent with ink text, no icon and no shadow', () => {
    const { button } = renderOption({ state: 'other' });

    expect(viewStyleOf(face()).backgroundColor).toBe('transparent');
    expect(textStyleOf(labelText()).color).toBe(colors.ink);
    expect(textStyleOf(labelText()).opacity).toBeUndefined();
    expect(within(button).queryAllByTestId(/option-icon/, HIDDEN)).toHaveLength(0);
    expect(viewStyleOf(button).transform).toBeUndefined();
    expect(shadow()).toBeNull();
  });
});

describe('OptionButton layout', () => {
  it('sets the label in the code font at 15 when mono, and the body style otherwise', () => {
    renderOption({ mono: true });
    expect(textStyleOf(labelText())).toMatchObject({ ...type.code, fontSize: 15 });
    expect(textStyleOf(labelText()).fontFamily).toBe(fonts.mono);

    screen.unmount();
    renderOption();
    expect(textStyleOf(labelText())).toMatchObject(type.body);
  });

  it('wraps a long label and keeps the icon at the trailing edge', () => {
    renderOption({ state: 'correct' });

    expect(viewStyleOf(face())).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    });
    expect(textStyleOf(labelText()).flexShrink).toBe(1);
    expect(labelText().props).not.toHaveProperty('numberOfLines');
  });

  it('fills a taller container, so a card can make it 62 points tall', () => {
    const { button } = renderOption();

    expect(viewStyleOf(button).flexGrow).toBe(1);
    expect(viewStyleOf(face()).flexGrow).toBe(1);
  });
});

describe('OptionButton behavior', () => {
  it('calls onPress once when pressed while idle', () => {
    const { onPress, button } = renderOption();

    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each<OptionState>(['correct', 'wrong', 'other'])('is locked when %s', (state) => {
    const { onPress, button } = renderOption({ state });

    fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('moves 2 points right and down and drops its shadow while pressed', () => {
    jest.useFakeTimers();
    const { onPress, button } = renderOption();

    fireEvent(button, 'responderGrant', PRESS_EVENT);

    expect(viewStyleOf(button).transform).toStrictEqual([{ translateX: 2 }, { translateY: 2 }]);
    expect(shadow()).toBeNull();

    fireEvent(button, 'responderRelease', PRESS_EVENT);
    // Pressability holds pressOut until a press has lasted its 130 ms minimum.
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(viewStyleOf(button).transform).toBeUndefined();
    expect(shadow()).not.toBeNull();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('OptionButton accessibility', () => {
  it.each([
    { state: 'idle', picked: false, name: LABEL },
    { state: 'correct', picked: true, name: `${LABEL}. Correct answer.` },
    { state: 'correct', picked: false, name: `${LABEL}. Correct answer.` },
    { state: 'wrong', picked: true, name: `${LABEL}. Not correct.` },
    { state: 'other', picked: false, name: LABEL },
  ] as const)('$state, picked $picked: says "$name"', ({ state, picked, name }) => {
    renderOption({ state, picked });
    const button = screen.getByRole('button', { name });

    expect(button.props).toMatchObject({
      accessibilityRole: 'button',
      accessibilityLabel: name,
      accessibilityState: { disabled: state !== 'idle', selected: picked },
    });
    expect(labelText()).toBeOnTheScreen();
  });

  it('is not selected unless picked is passed', () => {
    const { button } = renderOption({ state: 'correct' });

    expect(button.props).toMatchObject({ accessibilityState: { selected: false } });
  });

  it('hides the trailing icon from accessibility', () => {
    renderOption({ state: 'wrong' });

    expect(screen.queryByTestId('option-icon-wrong')).toBeNull();
    // Lucide's own `aria-hidden: 'true'` already hides it from RNTL, but a native Svg view may
    // not read that web-style string, so the button sets the native props explicitly.
    expect(screen.getByTestId('option-icon-wrong', HIDDEN).props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});

// Predict's grid options, docs/design/card-feed/reference/LearnLoop Card Feed v2.dc.html:132
// and screenshots/03-predict-answered.png.
describe('OptionButton compact', () => {
  it.each<OptionState>(['correct', 'wrong'])('%s: no icon', (state) => {
    const { button } = renderOption({ state, compact: true });

    expect(within(button).queryAllByTestId(/option-icon/, HIDDEN)).toHaveLength(0);
  });

  it('centers the label, 8 and 12 padding, and sets code at 14', () => {
    const { button } = renderOption({ mono: true, compact: true });

    expect(viewStyleOf(face())).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      minHeight: 52,
      flexGrow: 1,
    });
    expect(viewStyleOf(button).flexGrow).toBe(1);
    expect(textStyleOf(labelText())).toMatchObject({
      ...type.code,
      fontSize: 14,
      textAlign: 'center',
      flexShrink: 1,
    });
  });

  it('keeps the body style when not mono', () => {
    renderOption({ compact: true });

    expect(textStyleOf(labelText())).toMatchObject({ ...type.body, textAlign: 'center' });
  });

  it.each<OptionState>(['idle', 'correct', 'wrong', 'other'])(
    '%s: the same fill, text, scale, spoken label and state as without compact',
    (state) => {
      const look = (compact: boolean) => {
        const { button } = renderOption({ state, picked: true, mono: true, compact });
        const { color, opacity, textDecorationLine, fontFamily } = textStyleOf(labelText());
        const seen = {
          fill: viewStyleOf(face()).backgroundColor,
          text: { color, opacity, textDecorationLine, fontFamily },
          transform: viewStyleOf(button).transform,
          name: button.props.accessibilityLabel as unknown,
          state: button.props.accessibilityState as unknown,
          shadow: shadow() !== null,
        };
        screen.unmount();
        return seen;
      };

      expect(look(true)).toStrictEqual(look(false));
    },
  );

  it('moves 2 points and drops its shadow while pressed, like the default', () => {
    jest.useFakeTimers();
    const { button } = renderOption({ compact: true });
    expect(shadow()).not.toBeNull();

    fireEvent(button, 'responderGrant', PRESS_EVENT);

    expect(viewStyleOf(button).transform).toStrictEqual([{ translateX: 2 }, { translateY: 2 }]);
    expect(shadow()).toBeNull();
  });
});
