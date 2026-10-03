import type { Keypad } from '../../data/keypadSchema';
import { deleteAt, insertAt, type KeyPress, moveCaret, useKeypad } from '../keypad';

const keys: Keypad = {
  groups: [{ name: 'calls', keys: [{ label: 's("")', insert: 's("")', caret: 2 }] }],
  action: 'run',
};
const hh = { label: 'hh', insert: 'hh', caret: 0 };

beforeEach(() => {
  useKeypad.setState(useKeypad.getInitialState(), true);
});

describe('insertAt', () => {
  it('replaces the selection and leaves the caret after an insert with caret 0', () => {
    expect(insertAt('s("bd")', { start: 3, end: 5 }, hh)).toEqual({ value: 's("hh")', caret: 5 });
  });

  it('places the caret `caret` characters before the end of the inserted text (P5)', () => {
    const call = { label: 's("")', insert: 's("")', caret: 2 };

    expect(insertAt('', { start: 0, end: 0 }, call)).toEqual({ value: 's("")', caret: 3 });
  });

  it('inserts at the caret when nothing is selected (P12)', () => {
    const fast = { label: '.fast(', insert: '.fast(', caret: 0 };

    expect(insertAt('s("bd")', { start: 7, end: 7 }, fast)).toEqual({
      value: 's("bd").fast(',
      caret: 13,
    });
  });
});

describe('deleteAt', () => {
  it('deletes the one character before the caret', () => {
    expect(deleteAt('abc', { start: 3, end: 3 })).toEqual({ value: 'ab', caret: 2 });
  });

  it('deletes the selection when there is one', () => {
    expect(deleteAt('abc', { start: 1, end: 3 })).toEqual({ value: 'a', caret: 1 });
  });

  it('does nothing with the caret at 0 and nothing selected (P12)', () => {
    expect(deleteAt('abc', { start: 0, end: 0 })).toEqual({ value: 'abc', caret: 0 });
  });

  it('deletes a selection reported end first as the same selection', () => {
    expect(deleteAt('abc', { start: 3, end: 1 })).toEqual({ value: 'a', caret: 1 });
  });

  it('deletes a character outside the basic plane whole, not half of it', () => {
    expect(deleteAt('a🥁', { start: 3, end: 3 })).toEqual({ value: 'a', caret: 1 });
  });
});

describe('moveCaret', () => {
  it('moves one character left or right', () => {
    expect(moveCaret('abc', 1, -1)).toBe(0);
    expect(moveCaret('abc', 1, 1)).toBe(2);
  });

  it('stays at 0 moving left and at the end moving right (P12)', () => {
    expect(moveCaret('abc', 0, -1)).toBe(0);
    expect(moveCaret('abc', 3, 1)).toBe(3);
  });

  it('steps over a character outside the basic plane whole', () => {
    expect(moveCaret('a🥁b', 1, 1)).toBe(3);
    expect(moveCaret('a🥁b', 3, -1)).toBe(1);
  });
});

describe('keypad store', () => {
  it('starts hidden, on the keypad, with no editor registered', () => {
    const state = useKeypad.getState();

    expect(state.active).toBeNull();
    expect(state.systemKeyboard).toBeNull();
    expect(state.handlers).toEqual({});
  });

  it('shows the keys of an editor and hides them', () => {
    useKeypad.getState().show(keys, 'editor');
    expect(useKeypad.getState().active).toEqual({ keys, editorId: 'editor' });

    useKeypad.getState().hide();
    expect(useKeypad.getState().active).toBeNull();
  });

  it('ignores show after ABC for the same editor, until hide resets it', () => {
    useKeypad.getState().show(keys, 'editor');
    useKeypad.getState().useSystem();
    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: 'editor' });

    useKeypad.getState().show(keys, 'editor');
    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: 'editor' });

    useKeypad.getState().hide();
    expect(useKeypad.getState().systemKeyboard).toBeNull();
    useKeypad.getState().show(keys, 'editor');
    expect(useKeypad.getState().active).toEqual({ keys, editorId: 'editor' });
  });
});

describe('keypad store: ABC and hide by editor (P15)', () => {
  it('shows the keys of another editor after ABC (P15)', () => {
    useKeypad.getState().show(keys, 'first');
    useKeypad.getState().useSystem();

    useKeypad.getState().show(keys, 'second');

    expect(useKeypad.getState()).toMatchObject({
      active: { keys, editorId: 'second' },
      systemKeyboard: 'first',
    });
  });

  it('ignores a hide from an editor that is neither shown nor on the system keyboard (P15)', () => {
    useKeypad.getState().show(keys, 'second');

    useKeypad.getState().hide('first');

    expect(useKeypad.getState().active).toEqual({ keys, editorId: 'second' });
  });

  it('a hide from the shown editor hides the keypad (P15)', () => {
    useKeypad.getState().show(keys, 'editor');

    useKeypad.getState().hide('editor');

    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: null });
  });

  it("a late hide from the editor that chose ABC ends its turn and keeps another editor's keypad (P15)", () => {
    useKeypad.getState().show(keys, 'first');
    useKeypad.getState().useSystem();
    useKeypad.getState().show(keys, 'second');

    useKeypad.getState().hide('first');

    expect(useKeypad.getState()).toMatchObject({
      active: { keys, editorId: 'second' },
      systemKeyboard: null,
    });
  });

  it('a hide with no id hides whatever is shown and ends the system keyboard (P15)', () => {
    useKeypad.getState().show(keys, 'first');
    useKeypad.getState().useSystem();
    useKeypad.getState().show(keys, 'second');

    useKeypad.getState().hide();

    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: null });
  });

  it('ABC with nothing shown leaves no editor on the system keyboard', () => {
    useKeypad.getState().useSystem();

    expect(useKeypad.getState()).toMatchObject({ active: null, systemKeyboard: null });
  });
});

describe('keypad store: presses', () => {
  it('sends the action key to the active editor (P16)', () => {
    const handler = jest.fn<undefined, [KeyPress]>();
    useKeypad.getState().register('editor', handler);
    useKeypad.getState().show(keys, 'editor');

    useKeypad.getState().press('action');

    expect(handler.mock.calls).toEqual([['action']]);
  });

  it('does nothing on a press when the active editor has no handler', () => {
    const other = jest.fn<undefined, [KeyPress]>();
    useKeypad.getState().register('other', other);
    useKeypad.getState().show(keys, 'editor');

    expect(() => {
      useKeypad.getState().press('left');
    }).not.toThrow();
    expect(other).not.toHaveBeenCalled();
  });

  it('sends a press to the active editor only', () => {
    const first = jest.fn<undefined, [KeyPress]>();
    const second = jest.fn<undefined, [KeyPress]>();
    useKeypad.getState().register('first', first);
    useKeypad.getState().register('second', second);

    useKeypad.getState().show(keys, 'second');
    useKeypad.getState().press('delete');

    expect(second).toHaveBeenCalledWith('delete');
    expect(first).not.toHaveBeenCalled();
  });

  it('does nothing on a press with no active editor', () => {
    const handler = jest.fn<undefined, [KeyPress]>();
    useKeypad.getState().register('editor', handler);

    useKeypad.getState().press(hh);
    useKeypad.getState().show(keys, 'editor');
    useKeypad.getState().useSystem();
    useKeypad.getState().press('left');

    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps the later handler for one id; an unregister removes only its own', () => {
    const earlier = jest.fn<undefined, [KeyPress]>();
    const later = jest.fn<undefined, [KeyPress]>();
    const unregisterEarlier = useKeypad.getState().register('editor', earlier);
    const unregisterLater = useKeypad.getState().register('editor', later);
    useKeypad.getState().show(keys, 'editor');

    unregisterEarlier();
    useKeypad.getState().press('right');
    expect(later).toHaveBeenCalledWith('right');
    expect(earlier).not.toHaveBeenCalled();

    unregisterLater();
    expect(useKeypad.getState().handlers).toEqual({});
    useKeypad.getState().press('right');
    expect(later).toHaveBeenCalledTimes(1);
  });
});
