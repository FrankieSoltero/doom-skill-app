import { renderHook } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { useDismissKeyboardWhenLeft } from '../useDismissKeyboardWhenLeft';

let dismiss: jest.SpiedFunction<typeof Keyboard.dismiss>;

beforeEach(() => {
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Renders the hook with `active` and returns a way to change it. */
function renderLeaving(active: boolean) {
  const hook = renderHook(
    (props: { active: boolean }) => {
      useDismissKeyboardWhenLeft(props.active);
    },
    { initialProps: { active } },
  );
  return (next: boolean) => {
    hook.rerender({ active: next });
  };
}

describe('useDismissKeyboardWhenLeft', () => {
  it('dismisses the keyboard once when the card stops being the current page', () => {
    const setActive = renderLeaving(true);

    setActive(true);
    expect(dismiss).not.toHaveBeenCalled();

    setActive(false);
    setActive(false);
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses again each time the card is left after a return', () => {
    const setActive = renderLeaving(true);

    setActive(false);
    setActive(true);
    setActive(false);

    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it('leaves the keyboard alone for a card drawn off the current page, and on its arrival', () => {
    const setActive = renderLeaving(false);

    setActive(true);

    expect(dismiss).not.toHaveBeenCalled();
  });
});
