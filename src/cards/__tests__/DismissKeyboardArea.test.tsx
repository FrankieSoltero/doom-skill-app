import { render, screen, userEvent } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { Keyboard, Pressable, Text } from 'react-native';
import type { TextInputProps } from 'react-native';

import { viewStyleOf } from '../../components/testing/styles';
import { DismissKeyboardArea } from '../DismissKeyboardArea';
import { holdDown, letGo } from '../testing/press';

// React Native's Jest preset replaces TextInput with a stand-in that has no touch handling. The
// real one claims the touch itself (Pressability, `onPress` focuses it), as on a device.
const RealTextInput = jest.requireActual<{ default: ComponentType<TextInputProps> }>(
  'react-native/Libraries/Components/TextInput/TextInput',
).default;

let dismiss: jest.SpiedFunction<typeof Keyboard.dismiss>;

beforeEach(() => {
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** Draws the area around a text line, a button and, when asked, the real text input. */
function renderArea(onButton = jest.fn<undefined, []>(), withInput = false) {
  render(
    <DismissKeyboardArea>
      <Text>Card text</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Play" onPress={onButton}>
        <Text>Play</Text>
      </Pressable>
      {withInput ? <RealTextInput accessibilityLabel="Code editor" /> : null}
    </DismissKeyboardArea>,
  );
  return onButton;
}

describe('DismissKeyboardArea', () => {
  it('dismisses the keyboard when the card is tapped outside a button or the editor', async () => {
    renderArea();

    await userEvent.setup().press(screen.getByText('Card text'));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("lets a button take the tap: the button's action runs, the area does not dismiss", async () => {
    const onButton = renderArea();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Play' }));

    expect(onButton).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('lets the editor take the tap: it does not dismiss', async () => {
    renderArea(jest.fn<undefined, []>(), true);

    await userEvent.setup().press(screen.getByLabelText('Code editor'));

    expect(dismiss).not.toHaveBeenCalled();
  });

  it('is not an accessibility element, and its children are found by role', () => {
    renderArea();

    const area = screen.getByTestId('dismiss-keyboard-area');
    expect(area.props).toHaveProperty('accessible', false);
    expect(area.props).not.toHaveProperty('accessibilityRole');
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
  });

  it('fills its page and looks the same while pressed', () => {
    jest.useFakeTimers();
    renderArea();
    const area = screen.getByTestId('dismiss-keyboard-area');

    holdDown(area);
    expect(viewStyleOf(area)).toStrictEqual({ flex: 1 });
    letGo(area);

    expect(viewStyleOf(area)).toStrictEqual({ flex: 1 });
    jest.useRealTimers();
  });
});
