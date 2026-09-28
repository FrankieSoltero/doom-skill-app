import { act, renderHook } from '@testing-library/react-native';

import { useFeedInputFocus, useInputFocus, useInputFocused } from '../inputFocus';

const focus = (id: string) => {
  act(() => {
    useInputFocus.getState().inputFocused(id);
  });
};
const blur = (id: string) => {
  act(() => {
    useInputFocus.getState().inputBlurred(id);
  });
};

beforeEach(() => {
  useInputFocus.setState(useInputFocus.getInitialState());
});

describe('input focus store', () => {
  it('starts with no input focused', () => {
    const { result } = renderHook(() => useInputFocused());

    expect(result.current).toBe(false);
    expect(useInputFocus.getInitialState().focusedIds.size).toBe(0);
  });

  it('stays focused while any input has focus', () => {
    const { result } = renderHook(() => useInputFocused());

    focus('editor-a');
    focus('editor-b');
    blur('editor-a');
    expect(result.current).toBe(true);

    blur('editor-b');
    expect(result.current).toBe(false);
  });

  it('treats a second focus or a second blur of one input as no change', () => {
    const { result } = renderHook(() => useInputFocused());

    focus('editor');
    const afterFirstFocus = useInputFocus.getState();
    focus('editor');
    expect(useInputFocus.getState()).toBe(afterFirstFocus);

    blur('editor');
    expect(result.current).toBe(false);
    const afterFirstBlur = useInputFocus.getState();
    blur('editor');
    expect(useInputFocus.getState()).toBe(afterFirstBlur);
    expect(result.current).toBe(false);
  });
});

describe('useFeedInputFocus', () => {
  it('reports focus and blur for its own input', () => {
    const editor = renderHook(() => useFeedInputFocus());
    const focused = renderHook(() => useInputFocused());

    act(() => {
      editor.result.current.onFocus();
    });
    expect(focused.result.current).toBe(true);

    act(() => {
      editor.result.current.onBlur();
    });
    expect(focused.result.current).toBe(false);
  });

  it('gives each input its own id, so one blur leaves another focused', () => {
    const first = renderHook(() => useFeedInputFocus());
    const second = renderHook(() => useFeedInputFocus());
    const focused = renderHook(() => useInputFocused());

    act(() => {
      first.result.current.onFocus();
      second.result.current.onFocus();
    });
    act(() => {
      first.result.current.onBlur();
    });

    expect(focused.result.current).toBe(true);
    expect(useInputFocus.getState().focusedIds.size).toBe(1);
  });

  it('releases the focus when a focused input unmounts', () => {
    const editor = renderHook(() => useFeedInputFocus());
    const focused = renderHook(() => useInputFocused());
    act(() => {
      editor.result.current.onFocus();
    });

    editor.unmount();

    expect(focused.result.current).toBe(false);
  });

  it('keeps the same handlers across renders', () => {
    const editor = renderHook(() => useFeedInputFocus());
    const before = editor.result.current;

    editor.rerender(undefined);

    expect(editor.result.current).toBe(before);
  });
});
