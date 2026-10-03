import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Appearance, Keyboard, PanResponder, ScrollView } from 'react-native';
import type {
  AccessibilityActionEvent,
  PanResponderCallbacks,
  PanResponderGestureState,
} from 'react-native';

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
/** Keys whose label is what they insert. */
const plain = (...labels: string[]) => labels.map((label) => ({ label, insert: label, caret: 0 }));
/**
 * The Strudel exercise's keypad as the API serves it (`keys` of the exercise in the feed response
 * fixture), by hand: its node's two calls and two methods, Strudel's six marks and six numbers.
 */
const SERVED_KEYS: KeypadSpec = {
  groups: [
    { name: 'calls', keys: [{ label: 'note("")', insert: 'note("")', caret: 2 }, S_CALL] },
    {
      name: 'notation',
      keys: [
        { label: '< >', insert: '<>', caret: 1 },
        { label: '[ ]', insert: '[]', caret: 1 },
        ...plain('~', '*', ','),
        { label: '" "', insert: '""', caret: 1 },
      ],
    },
    { name: 'methods', keys: plain('.fast(', '.slow(') },
    { name: 'digits', keys: plain('1', '2', '3', '4', '8', '16') },
  ],
  action: 'run',
};

const createPanResponder = jest.spyOn(PanResponder, 'create');
// Closing the sheet also closes the editor's keyboard: the editor blurs and hides its keypad.
const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);

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
  useKeypad.setState({ active: null, systemKeyboard: null, handlers: {} });
  createPanResponder.mockClear();
  dismiss.mockClear();
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
    });
    // The keypad, the sheet's one child, holds the gaps between its rows.
    expect(viewStyleOf(sheet())).not.toHaveProperty('gap');
    expect(sheet().props.accessibilityViewIsModal).toBe(false);
    expect(screen.getByTestId('keypad-group-calls')).toBeOnTheScreen();
  });

  it('draws the served Strudel keypad as one row per group above the control row, unscrolled (P17)', () => {
    showKeypad(SERVED_KEYS);
    render(<KeypadSheet />);

    // 4 rows of 44 points, 3 gaps of 8, a gap of 8 and the 52 point control row: 260 of the 268
    // inside the sheet's padding.
    const rows = screen.getAllByTestId(/^keypad-group-/);
    expect(rows.map((row) => within(row).getAllByRole('button').length)).toStrictEqual([
      2, 6, 2, 6,
    ]);
    expect(screen.getByTestId('keypad-controls')).toBeOnTheScreen();
    expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
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
});

describe('KeypadSheet keys', () => {
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

    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: EDITOR });
    expect(handler).not.toHaveBeenCalled();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('the action key passes the action to the active editor, then closes the sheet and the keyboard (P16)', () => {
    const handler = showKeypad();
    // The press must reach the editor while it is still the active one.
    handler.mockImplementation(() => {
      expect(useKeypad.getState().active?.editorId).toBe(EDITOR);
    });
    render(<KeypadSheet />);

    fireEvent.press(screen.getByRole('button', { name: copy.keypadRun }));

    expect(handler.mock.calls).toEqual([['action']]);
    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: null });
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("offers a screen reader the escape action, which closes the sheet and the editor's keyboard", () => {
    const handler = showKeypad();
    render(<KeypadSheet />);

    expect(sheet().props.accessibilityActions).toStrictEqual([
      { name: 'escape', label: copy.keypadHide },
    ]);
    // RNTL fires no event on a view whose responder refuses a touch, as the swipe's does, so the
    // test calls the handler as the screen reader would.
    const { onAccessibilityAction } = sheet().props as {
      onAccessibilityAction: (event: AccessibilityActionEvent) => void;
    };
    const perform = (actionName: string) => {
      act(() => {
        onAccessibilityAction({ nativeEvent: { actionName } } as AccessibilityActionEvent);
      });
    };

    perform('activate');
    expect(useKeypad.getState().active).not.toBeNull();
    expect(dismiss).not.toHaveBeenCalled();
    perform('escape');
    expect(useKeypad.getState().active).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
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

  it("closes the sheet and the editor's keyboard on a release more than 40 points down", () => {
    showKeypad();
    render(<KeypadSheet />);

    act(() => {
      panConfig().onPanResponderRelease?.(PAN_EVENT, gesture(0, 41));
    });

    expect(useKeypad.getState().active).toBeNull();
    expect(screen.queryByTestId('keypad-sheet')).toBeNull();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('stays on a release of 40 points or less', () => {
    showKeypad();
    render(<KeypadSheet />);

    act(() => {
      panConfig().onPanResponderRelease?.(PAN_EVENT, gesture(0, 40));
    });

    expect(useKeypad.getState().active).not.toBeNull();
    expect(sheet()).toBeOnTheScreen();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
