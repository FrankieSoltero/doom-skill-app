import { act, renderHook } from '@testing-library/react-native';

import { useInputFocus, useInputFocused } from '../inputFocus';

beforeEach(() => {
  useInputFocus.getState().setInputFocused(false);
});

describe('input focus flag', () => {
  it('starts with no input focused', () => {
    expect(useInputFocus.getInitialState().focused).toBe(false);
  });

  it('is raised on focus and lowered on blur', () => {
    const { setInputFocused } = useInputFocus.getState();

    setInputFocused(true);
    expect(useInputFocus.getState().focused).toBe(true);

    setInputFocused(false);
    expect(useInputFocus.getState().focused).toBe(false);
  });

  it('re-renders a reader of the flag when it changes', () => {
    const { result } = renderHook(() => useInputFocused());
    expect(result.current).toBe(false);

    act(() => {
      useInputFocus.getState().setInputFocused(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      useInputFocus.getState().setInputFocused(false);
    });
    expect(result.current).toBe(false);
  });
});
