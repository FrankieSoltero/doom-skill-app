// Whether a text input in the feed (a REPL editor) has focus. The feed pager turns its swipe off
// while one does, so a drag that starts in an editor stays with the editor
// (docs/design/card-feed/README.md:44). Editors call `setInputFocused(true)` from `onFocus` and
// `setInputFocused(false)` from `onBlur`.
import { create } from 'zustand';

type InputFocusState = { focused: boolean };
type InputFocusActions = { setInputFocused: (focused: boolean) => void };

export const useInputFocus = create<InputFocusState & InputFocusActions>()((setState) => ({
  focused: false,
  setInputFocused: (focused) => {
    setState({ focused });
  },
}));

/** True while a feed text input has focus. The component re-renders when it changes. */
export function useInputFocused(): boolean {
  return useInputFocus((state) => state.focused);
}
