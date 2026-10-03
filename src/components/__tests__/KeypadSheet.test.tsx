import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Appearance, PanResponder } from 'react-native';
import type { PanResponderCallbacks, PanResponderGestureState } from 'react-native';

import { copy } from '../../copy';
import type { Keypad as KeypadSpec } from '../../data/keypadSchema';
import { useKeypad } from '../../feed/keypad';
import { colors } from '../../theme';
import { KeypadSheet } from '../KeypadSheet';
import { viewStyleOf } from '../testing/styles';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));

const S_CALL = { label: 's("")', insert: 's("")', caret: 2 };
const KEYS: KeypadSpec = { groups: [{ name: 'calls', keys: [S_CALL] }], action: 'run' };
const EDITOR = 'editor-1';

const createPanResponder = jest.spyOn(PanResponder, 'create');

/** The callbacks the sheet gave `PanResponder.create` on its last render. */
function panConfig(): PanResponderCallbacks {
  const config = createPanResponder.mock.lastCall?.[0];
  if (config === undefined) throw new Error('the sheet made no PanResponder');
  return config;
}

/** A gesture that moved by (`dx`, `dy`). The sheet reads only those two fields. */
function gesture(dx: number, dy: number): PanResponderGestureState {
  return { dx, dy } as PanResponderGestureState;
}

// The responder event the callbacks receive; the sheet does not read it.
const PAN_EVENT = {} as Parameters<NonNullable<PanResponderCallbacks['onPanResponderRelease']>>[0];

/** Shows the keypad for `EDITOR`, with a press handler registered under it. */
function showKeypad(keys: KeypadSpec = KEYS) {
  const handler = jest.fn();
  act(() => {
    useKeypad.getState().register(EDITOR, handler);
    useKeypad.getState().show(keys, EDITOR);
  });
  return handler;
}

const sheet = () => screen.getByTestId('keypad-sheet');

beforeEach(() => {
  useKeypad.setState({ active: null, systemKeyboard: false, handlers: {} });
  createPanResponder.mockClear();
});

describe('KeypadSheet', () => {
  it('renders nothing with no active editor', () => {
    render(<KeypadSheet />);

    expect(screen.toJSON()).toBeNull();
  });

  it('draws the active editor keys on a 292 point ink sheet that is not modal', () => {
    showKeypad();
    render(<KeypadSheet />);

    expect(viewStyleOf(sheet())).toMatchObject({
      height: 292,
      backgroundColor: colors.ink,
      padding: 12,
      gap: 8,
    });
    expect(sheet().props.accessibilityViewIsModal).toBe(false);
    expect(screen.getByTestId('keypad-group-calls')).toBeOnTheScreen();
  });

  it('appears when an editor shows the keypad and goes when it hides', () => {
    render(<KeypadSheet />);
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();

    showKeypad();
    expect(sheet()).toBeOnTheScreen();

    act(() => {
      useKeypad.getState().hide();
    });
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
  });

  it.each(['light', 'dark'] as const)('is ink in %s mode', (scheme) => {
    const colorScheme = jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
    showKeypad();
    render(<KeypadSheet />);

    expect(viewStyleOf(sheet()).backgroundColor).toBe(colors.ink);
    colorScheme.mockRestore();
  });

  it('passes a key press to the active editor', () => {
    const handler = showKeypad();
    render(<KeypadSheet />);

    fireEvent.press(screen.getByTestId('keypad-key-s("")'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(S_CALL);
    expect(useKeypad.getState().active).not.toBeNull();
  });

  it('ABC hands over to the system keyboard', () => {
    const handler = showKeypad();
    render(<KeypadSheet />);

    fireEvent.press(screen.getByRole('button', { name: copy.keypadAbc }));

    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: true });
    expect(handler).not.toHaveBeenCalled();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
  });

  it('the action key hides the sheet without a key press', () => {
    const handler = showKeypad();
    render(<KeypadSheet />);

    fireEvent.press(screen.getByRole('button', { name: copy.keypadRun }));

    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: false });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('KeypadSheet swipe down', () => {
  it('claims a downward drag and leaves taps and sideways drags to the keys', () => {
    showKeypad();
    render(<KeypadSheet />);
    const config = panConfig();

    expect(config.onStartShouldSetPanResponder?.(PAN_EVENT, gesture(0, 0)) ?? false).toBe(false);
    expect(config.onMoveShouldSetPanResponder?.(PAN_EVENT, gesture(0, 12))).toBe(true);
    expect(config.onMoveShouldSetPanResponder?.(PAN_EVENT, gesture(20, 12))).toBe(false);
    expect(config.onMoveShouldSetPanResponder?.(PAN_EVENT, gesture(0, -12))).toBe(false);
  });

  it('hides on a release more than 40 points down', () => {
    showKeypad();
    render(<KeypadSheet />);

    act(() => {
      panConfig().onPanResponderRelease?.(PAN_EVENT, gesture(0, 41));
    });

    expect(useKeypad.getState().active).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
  });

  it('stays on a release of 40 points or less', () => {
    showKeypad();
    render(<KeypadSheet />);

    act(() => {
      panConfig().onPanResponderRelease?.(PAN_EVENT, gesture(0, 40));
    });

    expect(useKeypad.getState().active).not.toBeNull();
    expect(sheet()).toBeOnTheScreen();
  });
});
