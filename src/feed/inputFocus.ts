// Which feed text inputs (the REPL editors) have focus. The feed pager turns its swipe off while
// any of them does, so a drag that starts in an editor stays with the editor
// (docs/design/card-feed/README.md:44). The store keeps a set of ids, not one flag: when focus
// moves between two editors, the order of one's blur and the other's focus does not matter.
//
// An editor uses the hook: `const { onFocus, onBlur } = useFeedInputFocus();` and passes both to
// its `TextInput`. The hook releases the editor's id when it unmounts, so an editor removed while
// focused does not leave the pager locked.
import { useEffect, useId, useMemo } from 'react';
import { create } from 'zustand';

type InputFocusState = { focusedIds: ReadonlySet<string> };
type InputFocusActions = {
  /** Marks the input `id` focused. Focusing a focused input changes nothing. */
  inputFocused: (id: string) => void;
  /** Marks the input `id` blurred. Blurring an input that is not focused changes nothing. */
  inputBlurred: (id: string) => void;
};
type InputFocusStore = InputFocusState & InputFocusActions;

/** The set with `id` added, or the same state when it is already there. */
function withFocused(state: InputFocusStore, id: string): InputFocusStore | InputFocusState {
  if (state.focusedIds.has(id)) return state;
  return { focusedIds: new Set([...state.focusedIds, id]) };
}

/** The set with `id` removed, or the same state when it is not there. */
function withBlurred(state: InputFocusStore, id: string): InputFocusStore | InputFocusState {
  if (!state.focusedIds.has(id)) return state;
  const focusedIds = new Set(state.focusedIds);
  focusedIds.delete(id);
  return { focusedIds };
}

export const useInputFocus = create<InputFocusStore>()((setState) => ({
  focusedIds: new Set<string>(),
  inputFocused: (id) => {
    setState((state) => withFocused(state, id));
  },
  inputBlurred: (id) => {
    setState((state) => withBlurred(state, id));
  },
}));

/** True while any feed text input has focus. The component re-renders when it changes. */
export function useInputFocused(): boolean {
  return useInputFocus((state) => state.focusedIds.size > 0);
}

/**
 * Focus handlers for one feed text input, under an id of its own. Pass them to the input's
 * `onFocus` and `onBlur`. They keep their identity across renders.
 */
export function useFeedInputFocus(): { onFocus: () => void; onBlur: () => void } {
  const id = useId();

  useEffect(
    () => () => {
      useInputFocus.getState().inputBlurred(id);
    },
    [id],
  );

  return useMemo(
    () => ({
      onFocus: () => {
        useInputFocus.getState().inputFocused(id);
      },
      onBlur: () => {
        useInputFocus.getState().inputBlurred(id);
      },
    }),
    [id],
  );
}
