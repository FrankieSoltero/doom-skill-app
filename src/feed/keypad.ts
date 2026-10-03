// The code keypad (M9 plan K; spec 3.2): which code editor shows it, and what a key press does to
// that editor's text. The keypad sheet reads `active` and calls `press`; each code editor
// registers a handler under its own id, calls `show` on focus and `hide` on blur (P7).
//
// Positions are UTF-16 code units, the units of a JS string's indices and of the `selection` a
// `TextInput` reports and takes, so a result goes back to the input unconverted. Delete and the
// caret keys step over a character outside the basic plane (two units) whole, so they never leave
// half of one in the text or the caret between its halves.
import { create } from 'zustand';

import type { Keypad, KeySpec } from '../data/keypadSchema';

/** A key of the sheet: a group key to insert, or one of the delete and caret keys. */
export type KeyPress = KeySpec | 'delete' | 'left' | 'right';

type Selection = { start: number; end: number };

export type KeypadState = {
  /** The editor the keypad shows for, and its keys; `null` while the keypad is hidden. */
  active: { keys: Keypad; editorId: string } | null;
  /** True after ABC: the focused editor uses the system keyboard until it blurs (P7). */
  systemKeyboard: boolean;
  /** Each registered editor's press handler, by editor id. */
  handlers: Record<string, (press: KeyPress) => void>;
  /** Shows `keys` for `editorId`. Does nothing while `systemKeyboard` is true. */
  show: (keys: Keypad, editorId: string) => void;
  /** Hides the keypad and ends the system keyboard's turn. */
  hide: () => void;
  /** Hides the keypad for the system keyboard (ABC). */
  useSystem: () => void;
  /** Registers `handler` for `editorId`, replacing an earlier one. Returns its unregister. */
  register: (editorId: string, handler: (press: KeyPress) => void) => () => void;
  /** Passes `press` to the active editor's handler; does nothing with no active editor. */
  press: (press: KeyPress) => void;
};

/** True when the units at `index - 1` and `index` are the two halves of one character. */
function splitsPair(value: string, index: number): boolean {
  const high = value.charCodeAt(index - 1);
  const low = value.charCodeAt(index);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff;
}

/**
 * `key.insert` in place of the selection, and the caret `key.caret` units before the end of the
 * inserted text (P5). An empty selection inserts at the caret (P12).
 */
export function insertAt(
  value: string,
  selection: Selection,
  key: KeySpec,
): { value: string; caret: number } {
  return {
    value: value.slice(0, selection.start) + key.insert + value.slice(selection.end),
    caret: selection.start + key.insert.length - key.caret,
  };
}

/**
 * The text with the selection deleted, or with the character before the caret deleted when
 * nothing is selected. With the caret at 0 and nothing selected, the text is unchanged (P12).
 */
export function deleteAt(value: string, selection: Selection): { value: string; caret: number } {
  const { end } = selection;
  let { start } = selection;
  if (start === end) {
    if (start === 0) return { value, caret: 0 };
    start = moveCaret(value, start, -1);
  }
  return { value: value.slice(0, start) + value.slice(end), caret: start };
}

/** The caret moved one character by `by`, kept within `[0, value.length]` (P12). */
export function moveCaret(value: string, caret: number, by: -1 | 1): number {
  const moved = Math.min(Math.max(caret + by, 0), value.length);
  return splitsPair(value, moved) ? moved + by : moved;
}

export const useKeypad = create<KeypadState>()((setState, getState) => ({
  active: null,
  systemKeyboard: false,
  handlers: {},
  show: (keys, editorId) => {
    if (getState().systemKeyboard) return;
    setState({ active: { keys, editorId } });
  },
  hide: () => {
    setState({ active: null, systemKeyboard: false });
  },
  useSystem: () => {
    setState({ active: null, systemKeyboard: true });
  },
  register: (editorId, handler) => {
    setState((state) => ({ handlers: { ...state.handlers, [editorId]: handler } }));
    return () => {
      setState((state) => {
        if (state.handlers[editorId] !== handler) return state;
        const handlers = Object.fromEntries(
          Object.entries(state.handlers).filter(([id]) => id !== editorId),
        );
        return { handlers };
      });
    };
  },
  press: (press) => {
    const { active, handlers } = getState();
    if (active === null) return;
    handlers[active.editorId]?.(press);
  },
}));
