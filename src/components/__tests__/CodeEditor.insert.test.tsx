import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform, TextInput } from 'react-native';

import type { Keypad, KeySpec } from '../../data/keypadSchema';
import { useInputFocus } from '../../feed/inputFocus';
import { type KeyPress, useKeypad } from '../../feed/keypad';
import { MAX_CODE_LENGTH } from '../../strudel/bridge';
import { colors } from '../../theme';
import { CodeEditor } from '../CodeEditor';

const S_CALL: KeySpec = { label: 's("")', insert: 's("")', caret: 2 };
const HH: KeySpec = { label: 'hh', insert: 'hh', caret: 0 };
const KEYS: Keypad = { groups: [{ name: 'calls', keys: [S_CALL, HH] }], action: 'run' };

type Selection = { start: number; end: number };
type HarnessProps = { initial: string; keys?: Keypad | null | undefined; onAction?: () => void };

const onChange = jest.fn<undefined, [string]>();

/** An editor whose parent keeps the code, as a card does; every new text also reaches `onChange`. */
function Harness({ initial, keys, onAction }: HarnessProps) {
  const [code, setCode] = useState(initial);
  return (
    <CodeEditor
      value={code}
      onChange={(next) => {
        onChange(next);
        setCode(next);
      }}
      caret={colors.lime}
      height={100}
      {...(keys === undefined ? {} : { keys })}
      {...(onAction === undefined ? {} : { onAction })}
    />
  );
}

const editor = () => screen.getByLabelText('Code editor');
/** The input's props this task adds. */
const inputProps = () =>
  editor().props as { selection?: Selection; showSoftInputOnFocus?: boolean };
const focus = () => {
  fireEvent(editor(), 'focus');
};
const blur = () => {
  fireEvent(editor(), 'blur');
};
const select = (start: number, end = start) => {
  fireEvent(editor(), 'selectionChange', { nativeEvent: { selection: { start, end } } });
};
const press = (key: KeyPress) => {
  act(() => {
    useKeypad.getState().press(key);
  });
};
/** The id the editor shows the keypad under. */
const activeId = () => useKeypad.getState().active?.editorId;

beforeEach(() => {
  onChange.mockClear();
  useKeypad.setState(useKeypad.getInitialState(), true);
  useInputFocus.setState(useInputFocus.getInitialState());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('CodeEditor without keys', () => {
  it.each([
    ['absent', undefined],
    ['null', null],
  ])('with keys %s, is the editor it was and never touches the keypad', (_, keys) => {
    const initial = useKeypad.getState();
    render(<Harness initial="abc" keys={keys} />);

    focus();
    select(1);
    blur();

    expect(useKeypad.getState()).toBe(initial);
    expect(editor().props).not.toHaveProperty('selection');
    expect(editor().props).not.toHaveProperty('showSoftInputOnFocus');
    expect(screen.getByRole('button', { name: 'Done' })).toBeOnTheScreen();
  });
});

describe('CodeEditor with keys', () => {
  it('shows its keys on focus, with the system keyboard off', () => {
    render(<Harness initial="" keys={KEYS} />);
    expect(inputProps().showSoftInputOnFocus).toBe(false);

    focus();

    expect(useKeypad.getState().active?.keys).toBe(KEYS);
    expect(Object.keys(useKeypad.getState().handlers)).toStrictEqual([activeId()]);
    expect(inputProps().showSoftInputOnFocus).toBe(false);
    expect(useInputFocus.getState().focusedIds.size).toBe(1);
  });

  it('hides the keypad on blur and stays registered', () => {
    render(<Harness initial="" keys={KEYS} />);
    focus();
    const id = activeId();

    blur();

    expect(useKeypad.getState().active).toBeNull();
    expect(Object.keys(useKeypad.getState().handlers)).toStrictEqual([id]);
    expect(useInputFocus.getState().focusedIds.size).toBe(0);
  });

  it('unregisters on unmount, and hides the keypad it showed', () => {
    const view = render(<Harness initial="" keys={KEYS} />);
    focus();

    view.unmount();

    expect(useKeypad.getState().handlers).toStrictEqual({});
    expect(useKeypad.getState().active).toBeNull();
  });
});

describe('CodeEditor group keys', () => {
  it('inserts a key at the caret and places the caret inside it (P5)', () => {
    render(<Harness initial="" keys={KEYS} />);
    focus();

    press(S_CALL);

    expect(onChange.mock.calls).toStrictEqual([['s("")']]);
    expect(editor()).toHaveDisplayValue('s("")');
    expect(inputProps().selection).toStrictEqual({ start: 3, end: 3 });
  });

  it('replaces the selection, and a second key goes where the first left the caret', () => {
    render(<Harness initial={'s("bd")'} keys={KEYS} />);
    focus();
    select(3, 5);

    press(HH);
    expect(editor()).toHaveDisplayValue('s("hh")');
    expect(inputProps().selection).toStrictEqual({ start: 5, end: 5 });

    press(HH);
    expect(editor()).toHaveDisplayValue('s("hhhh")');
    expect(inputProps().selection).toStrictEqual({ start: 7, end: 7 });
  });

  it('replaces a selection reported end first as the same selection', () => {
    render(<Harness initial={'s("bd")'} keys={KEYS} />);
    focus();
    select(5, 3);

    press(HH);

    expect(editor()).toHaveDisplayValue('s("hh")');
  });

  it('starts with the caret at the end of the code', () => {
    render(<Harness initial={'s("bd")'} keys={KEYS} />);

    expect(inputProps().selection).toStrictEqual({ start: 7, end: 7 });
  });

  it('keeps the selection it gives the input within the code when the code shrinks', () => {
    const view = render(
      <CodeEditor
        value="abcdef"
        onChange={onChange}
        caret={colors.lime}
        height={100}
        keys={KEYS}
      />,
    );
    select(6);

    view.rerender(
      <CodeEditor value="ab" onChange={onChange} caret={colors.lime} height={100} keys={KEYS} />,
    );

    expect(inputProps().selection).toStrictEqual({ start: 2, end: 2 });
  });

  it('inserts nothing that would take the code past the most the player accepts', () => {
    render(<Harness initial={'x'.repeat(MAX_CODE_LENGTH - 1)} keys={KEYS} />);
    focus();

    press(HH);

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CodeEditor delete, caret and action keys', () => {
  it('deletes the character before the caret, and the selection when there is one', () => {
    render(<Harness initial="abcd" keys={KEYS} />);
    focus();
    select(3);

    press('delete');
    expect(editor()).toHaveDisplayValue('abd');
    expect(inputProps().selection).toStrictEqual({ start: 2, end: 2 });

    select(0, 2);
    press('delete');
    expect(editor()).toHaveDisplayValue('d');
    expect(inputProps().selection).toStrictEqual({ start: 0, end: 0 });
  });

  it('does nothing on delete with the caret at 0 (P12)', () => {
    render(<Harness initial="abc" keys={KEYS} />);
    focus();
    select(0);

    press('delete');

    expect(onChange).not.toHaveBeenCalled();
    expect(inputProps().selection).toStrictEqual({ start: 0, end: 0 });
  });

  it('moves the caret one character left and right, never past either end (P12)', () => {
    render(<Harness initial="abc" keys={KEYS} />);
    focus();
    select(1);

    press('left');
    expect(inputProps().selection).toStrictEqual({ start: 0, end: 0 });
    press('left');
    expect(inputProps().selection).toStrictEqual({ start: 0, end: 0 });

    select(2);
    press('right');
    expect(inputProps().selection).toStrictEqual({ start: 3, end: 3 });
    press('right');
    expect(inputProps().selection).toStrictEqual({ start: 3, end: 3 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moves left from the start of a selection and right from its end', () => {
    render(<Harness initial="abcd" keys={KEYS} />);
    focus();

    select(1, 3);
    press('left');
    expect(inputProps().selection).toStrictEqual({ start: 0, end: 0 });

    select(1, 3);
    press('right');
    expect(inputProps().selection).toStrictEqual({ start: 4, end: 4 });
  });

  it('passes the action key to onAction, and nothing to onChange (P16)', () => {
    const onAction = jest.fn<undefined, []>();
    render(<Harness initial="abc" keys={KEYS} onAction={onAction} />);
    focus();

    press('action');

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores the action key without onAction', () => {
    render(<Harness initial="abc" keys={KEYS} />);
    focus();

    expect(() => {
      press('action');
    }).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CodeEditor ABC', () => {
  it('turns the system keyboard on and focuses again, then back to the keypad after blur', () => {
    const refocus = jest.spyOn(TextInput.prototype, 'focus');
    render(<Harness initial="" keys={KEYS} />);
    focus();
    const id = activeId();

    act(() => {
      useKeypad.getState().useSystem();
    });

    expect(useKeypad.getState().systemKeyboard).toBe(id);
    expect(inputProps().showSoftInputOnFocus).toBe(true);
    expect(refocus).toHaveBeenCalledTimes(1);

    blur();
    expect(useKeypad.getState().systemKeyboard).toBeNull();
    expect(inputProps().showSoftInputOnFocus).toBe(false);

    focus();
    expect(useKeypad.getState().active?.editorId).toBe(id);
    expect(refocus).toHaveBeenCalledTimes(1);
  });

  it("does not take another editor's ABC for its own", () => {
    render(
      <>
        <Harness initial="a" keys={KEYS} />
        <Harness initial="b" keys={KEYS} />
      </>,
    );
    const [first, second] = screen.getAllByLabelText('Code editor');
    if (first === undefined || second === undefined) throw new Error('two editors expected');

    fireEvent(first, 'focus');
    act(() => {
      useKeypad.getState().useSystem();
    });

    expect(first.props).toMatchObject({ showSoftInputOnFocus: true });
    expect(second.props).toMatchObject({ showSoftInputOnFocus: false });
  });
});

describe('CodeEditor Done key with keys (iOS)', () => {
  /** The `inputAccessoryViewID` of the editor. */
  const accessoryId = () =>
    (editor().props as { inputAccessoryViewID?: string }).inputAccessoryViewID;

  it('has no Done bar while the keypad is in use, and has it with the system keyboard', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    render(<Harness initial="" keys={KEYS} />);
    focus();

    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(accessoryId()).toBeUndefined();

    act(() => {
      useKeypad.getState().useSystem();
    });

    expect(screen.getByRole('button', { name: 'Done' })).toBeOnTheScreen();
    expect(typeof accessoryId()).toBe('string');
  });
});
