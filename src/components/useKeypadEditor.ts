// A code editor's side of the code keypad (M9 plan K, P7, P8, P15, P16; src/feed/keypad.ts). An
// editor with keys shows them while focused instead of the system keyboard, applies each key
// press to its text and caret, and hands over to the system keyboard on ABC until it blurs. An
// editor without keys never touches the keypad store.
import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { TextInput, TextInputSelectionChangeEvent } from 'react-native';

import type { Keypad } from '../data/keypadSchema';
import { useFeedInputFocus } from '../feed/inputFocus';
import { deleteAt, type KeyPress, insertAt, moveCaret, useKeypad } from '../feed/keypad';
import { MAX_CODE_LENGTH } from '../strudel/bridge';

type Selection = { start: number; end: number };

type KeypadEditorOptions = {
  /** The ref the editor gives its `TextInput`, so ABC can focus it again. */
  input: RefObject<TextInput | null>;
  /** The editor's keypad; `null` or absent for an editor that uses the system keyboard only. */
  keys: Keypad | null | undefined;
  /** The editor's text. */
  value: string;
  /** Called with the whole new text after a key press changes it. */
  onChange: (value: string) => void;
  /** Called on the keypad's action key (P16). */
  onAction: (() => void) | undefined;
};

/** The props the editor's `TextInput` takes from the keypad. */
type KeypadInputProps = {
  onFocus: () => void;
  onBlur: () => void;
  selection?: Selection;
  onSelectionChange?: (event: TextInputSelectionChangeEvent) => void;
  showSoftInputOnFocus?: boolean;
};

type KeypadEditor = {
  /** True while the editor uses the system keyboard: always without keys, after ABC with them. */
  systemKeyboard: boolean;
  /** Spread on the editor's `TextInput`. */
  inputProps: KeypadInputProps;
};

/** `selection` kept within a text of `length` units: a controlled selection past the end throws. */
function within(selection: Selection, length: number): Selection {
  return { start: Math.min(selection.start, length), end: Math.min(selection.end, length) };
}

/**
 * The text and caret after the delete, caret or group key `press`. ← moves from the selection's
 * start and → from its end, one character, never past either end (P12).
 */
function edit(
  press: Exclude<KeyPress, 'action'>,
  value: string,
  selection: Selection,
): { value: string; caret: number } {
  if (press === 'delete') return deleteAt(value, selection);
  if (press === 'left') return { value, caret: moveCaret(value, selection.start, -1) };
  if (press === 'right') return { value, caret: moveCaret(value, selection.end, 1) };
  return insertAt(value, selection, press);
}

/**
 * Wires one code editor to the keypad. With `keys`: registers one press handler under the
 * editor's own id for as long as it is mounted (it reads the latest render's text, caret and
 * callbacks), shows the keys on focus and hides them on blur, keeps the system keyboard off while
 * the keypad is in use, and controls the input's selection so a press can place the caret. After
 * ABC for this editor the system keyboard is on and the input is focused again so it opens; the
 * editor's blur ends that turn. The feed's focus flag (`useFeedInputFocus`) is set either way.
 */
export function useKeypadEditor({
  input,
  keys,
  value,
  onChange,
  onAction,
}: KeypadEditorOptions): KeypadEditor {
  const feedFocus = useFeedInputFocus();
  const id = useId();
  const [selection, setSelection] = useState<Selection>({ start: value.length, end: value.length });
  const hasKeys = keys != null;
  const systemKeyboard = useKeypad((state) => !hasKeys || state.systemKeyboard === id);
  const shown = within(selection, value.length);
  // What the press handler reads: the latest render's, so the handler is registered once.
  const latest = useRef({ value, selection, onChange, onAction });
  useLayoutEffect(() => {
    latest.current = { value, selection, onChange, onAction };
  });

  useEffect(() => {
    if (!hasKeys) return undefined;
    return useKeypad.getState().register(id, (press) => {
      const current = latest.current;
      if (press === 'action') {
        current.onAction?.();
        return;
      }
      const next = edit(press, current.value, within(current.selection, current.value.length));
      if (next.value.length > MAX_CODE_LENGTH) return;
      if (next.value !== current.value) current.onChange(next.value);
      setSelection({ start: next.caret, end: next.caret });
    });
  }, [hasKeys, id]);

  // An editor removed while its keypad shows takes the keypad with it.
  useEffect(() => {
    if (!hasKeys) return undefined;
    return () => {
      useKeypad.getState().hide(id);
    };
  }, [hasKeys, id]);

  // After ABC: the input now takes the system keyboard; focusing it again opens it.
  useEffect(() => {
    if (hasKeys && systemKeyboard) input.current?.focus();
  }, [input, hasKeys, systemKeyboard]);

  if (!hasKeys) return { systemKeyboard, inputProps: feedFocus };
  return {
    systemKeyboard,
    inputProps: {
      onFocus: () => {
        feedFocus.onFocus();
        useKeypad.getState().show(keys, id);
      },
      onBlur: () => {
        feedFocus.onBlur();
        useKeypad.getState().hide(id);
      },
      selection: shown,
      onSelectionChange: ({ nativeEvent }) => {
        const { start, end } = nativeEvent.selection;
        setSelection({ start: Math.min(start, end), end: Math.max(start, end) });
      },
      showSoftInputOnFocus: systemKeyboard,
    },
  };
}
