import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { ScrollView } from 'react-native';

import { copy } from '../../copy';
import type { Keypad as KeypadSpec } from '../../data/keypadSchema';
import { colors, fonts } from '../../theme';
import { Keypad } from '../Keypad';
import { textStyleOf, viewStyleOf } from '../testing/styles';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const S_CALL = { label: 's("")', insert: 's("")', caret: 2 };
const NOTE_CALL = { label: 'note("")', insert: 'note("")', caret: 2 };
// Strudel's notation row: six keys, the most a group holds (P17).
const NOTATION = ['< >', '[ ]', '~', '*', ',', '" "'].map((label) => ({
  label,
  insert: label.replace(' ', ''),
  caret: label.length === 3 ? 1 : 0,
}));
const FAST = { label: '.fast(', insert: '.fast(', caret: 0 };
const ONE = { label: '1', insert: '1', caret: 0 };

const KEYS: KeypadSpec = {
  groups: [
    { name: 'calls', keys: [S_CALL, NOTE_CALL] },
    { name: 'notation', keys: NOTATION },
    { name: 'methods', keys: [FAST] },
    { name: 'digits', keys: [ONE] },
  ],
  action: 'run',
};

/**
 * The fields Pressability reads from a responder event. With no `touches`, it takes the touch
 * position from `nativeEvent` itself, and it skips the timestamp when there is none.
 */
const PRESS_EVENT = {
  persist: () => undefined,
  currentTarget: { measure: () => undefined },
  nativeEvent: { pageX: 0, pageY: 0 },
};

const HIDDEN = { includeHiddenElements: true };

function renderKeypad(keys: KeypadSpec = KEYS) {
  const props = { onPress: jest.fn(), onAbc: jest.fn(), onAction: jest.fn() };
  render(<Keypad keys={keys} {...props} />);
  return props;
}

const key = (label: string) => screen.getByTestId(`keypad-key-${label}`);
const faceOf = (label: string) => within(key(label)).getByTestId('keypad-key-face', HIDDEN);
const shadowOf = (label: string) => within(key(label)).queryByTestId('keypad-key-shadow', HIDDEN);

beforeEach(() => {
  jest.mocked(Haptics.selectionAsync).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Keypad layout', () => {
  it('draws one row per group in the keypad order, with its spoken group name', () => {
    renderKeypad();

    const rows = screen.getAllByTestId(/^keypad-group-/);
    expect(rows.map((row) => row.props.testID as string)).toStrictEqual([
      'keypad-group-calls',
      'keypad-group-notation',
      'keypad-group-methods',
      'keypad-group-digits',
    ]);
    expect(rows.map((row) => row.props.accessibilityLabel as string)).toStrictEqual([
      copy.keypadGroup.calls,
      copy.keypadGroup.notation,
      copy.keypadGroup.methods,
      copy.keypadGroup.digits,
    ]);
  });

  it('omits a group the keypad does not send', () => {
    renderKeypad({ groups: [{ name: 'digits', keys: [ONE] }], action: 'run' });

    expect(screen.getAllByTestId(/^keypad-group-/)).toHaveLength(1);
    expect(screen.getByTestId('keypad-group-digits')).toBeOnTheScreen();
  });

  it('draws the keys in order, each a button named by its label', () => {
    renderKeypad();

    const calls = within(screen.getByTestId('keypad-group-calls')).getAllByRole('button');
    expect(calls.map((button) => button.props.accessibilityLabel as string)).toStrictEqual([
      's("")',
      'note("")',
    ]);
    expect(within(key('s("")')).getByText('s("")')).toBeOnTheScreen();
  });

  it('draws each group as one row of its 1 to 6 keys, each stretching to the width (P17)', () => {
    renderKeypad();

    const rows = screen.getAllByTestId(/^keypad-group-/);
    expect(rows.map((row) => within(row).getAllByRole('button').length)).toStrictEqual([
      2, 6, 1, 1,
    ]);
    for (const row of rows) {
      expect(viewStyleOf(row)).toMatchObject({ flexDirection: 'row', gap: 8 });
    }
    expect(viewStyleOf(key('" "'))).toMatchObject({ flex: 1, height: 44 });
    expect(viewStyleOf(key('1'))).toMatchObject({ flex: 1, height: 44 });
  });

  it('holds nothing that scrolls: the rows fit above the control row (P17)', () => {
    renderKeypad();

    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  });

  it('ends with the control row: left, right, delete, ABC, then the action key over two columns', () => {
    renderKeypad();

    const controls = within(screen.getByTestId('keypad-controls')).getAllByRole('button');
    expect(controls.map((button) => button.props.accessibilityLabel as string)).toStrictEqual([
      copy.keypadLeft,
      copy.keypadRight,
      copy.keypadDelete,
      copy.keypadAbc,
      copy.keypadRun,
    ]);
    expect(viewStyleOf(key(copy.keypadLeft))).toMatchObject({ flex: 1, height: 52 });
    expect(viewStyleOf(key(copy.keypadRun))).toMatchObject({ flex: 2, height: 52 });
  });

  it('labels the action key Submit on a checkpoint keypad', () => {
    renderKeypad({ ...KEYS, action: 'submit' });

    expect(screen.getByRole('button', { name: copy.keypadSubmit })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: copy.keypadRun })).toBeNull();
  });
});

describe('Keypad looks', () => {
  it.each([
    ['calls', 's("")', colors.lime],
    ['notation', '~', colors.pink],
    ['methods', '.fast(', colors.aqua],
    ['digits', '1', colors.yellow],
  ])('a %s key: paper face, 1 point ink border, 3 point shadow in its colour', (_, label, hue) => {
    renderKeypad();

    expect(viewStyleOf(faceOf(label))).toMatchObject({
      backgroundColor: colors.paper,
      borderWidth: 1,
      borderColor: colors.ink,
    });
    expect(viewStyleOf(shadowOf(label) ?? key(label))).toMatchObject({
      position: 'absolute',
      top: 3,
      left: 3,
      right: -3,
      bottom: -3,
      backgroundColor: hue,
    });
  });

  it('sets code keys in the mono font at 13, ink', () => {
    renderKeypad();

    expect(textStyleOf(screen.getByText('.fast('))).toMatchObject({
      fontFamily: fonts.mono,
      fontSize: 13,
      color: colors.ink,
    });
  });

  it('sets word keys in the heading font at 16', () => {
    renderKeypad();

    expect(textStyleOf(screen.getByText(copy.keypadAbc))).toMatchObject({
      fontFamily: fonts.heading,
      fontSize: 16,
      color: colors.ink,
    });
    expect(textStyleOf(screen.getByText(copy.keypadRun))).toMatchObject({
      fontFamily: fonts.heading,
      fontSize: 16,
    });
  });

  it('draws the action key lime on a paper shadow', () => {
    renderKeypad();

    expect(viewStyleOf(faceOf(copy.keypadRun)).backgroundColor).toBe(colors.lime);
    expect(viewStyleOf(shadowOf(copy.keypadRun) ?? key(copy.keypadRun)).backgroundColor).toBe(
      colors.paper,
    );
  });

  it('pressed: moves 3 points right and down, drops its shadow and fills with its colour', () => {
    jest.useFakeTimers();
    renderKeypad();

    fireEvent(key('~'), 'responderGrant', PRESS_EVENT);

    expect(viewStyleOf(key('~')).transform).toStrictEqual([{ translateX: 3 }, { translateY: 3 }]);
    expect(shadowOf('~')).toBeNull();
    expect(viewStyleOf(faceOf('~')).backgroundColor).toBe(colors.pink);

    fireEvent(key('~'), 'responderRelease', PRESS_EVENT);
    // Pressability holds pressOut until a press has lasted its 130 ms minimum.
    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(viewStyleOf(key('~')).transform).toBeUndefined();
    expect(shadowOf('~')).not.toBeNull();
    expect(viewStyleOf(faceOf('~')).backgroundColor).toBe(colors.paper);
  });
});

describe('Keypad presses', () => {
  it('a key: passes its spec once, with one haptic tick', () => {
    const { onPress, onAction } = renderKeypad();

    fireEvent.press(key('s("")'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(S_CALL);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });

  it.each([
    [copy.keypadDelete, 'delete'],
    [copy.keypadLeft, 'left'],
    [copy.keypadRight, 'right'],
  ])('%s: passes %s, with one haptic tick', (label, press) => {
    const { onPress } = renderKeypad();

    fireEvent.press(key(label));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(press);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('the action key: calls onAction only', () => {
    const { onPress, onAbc, onAction } = renderKeypad();

    fireEvent.press(key(copy.keypadRun));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(onAbc).not.toHaveBeenCalled();
  });

  it('ABC: calls onAbc only', () => {
    const { onPress, onAbc, onAction } = renderKeypad();

    fireEvent.press(key(copy.keypadAbc));

    expect(onAbc).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
