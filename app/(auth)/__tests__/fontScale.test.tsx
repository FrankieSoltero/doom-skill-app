import { screen } from 'expo-router/testing-library';
import * as ReactNative from 'react-native';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import type { TextStyle } from 'react-native';

import { reachCodeStep, renderSignIn, submitEmail } from '../../../src/components/testing/signIn';

// The plan's check for the largest text size (Larger Accessibility Sizes, `fontScale` 2): both
// sign-in screens render there, and no text can be clipped: no text or field caps its lines or
// its height, or turns font scaling off, and each screen scrolls. The device checklist (9.6) has
// the matching check by eye.

jest.mock('../../../src/auth/supabase', () => ({
  supabase: { auth: { signInWithOtp: jest.fn(), verifyOtp: jest.fn() } },
}));

beforeEach(() => {
  jest.spyOn(ReactNative.PixelRatio, 'getFontScale').mockReturnValue(2);
  jest.spyOn(ReactNative, 'useWindowDimensions').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 2,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

type TextProps = {
  numberOfLines?: number;
  allowFontScaling?: boolean;
  maxFontSizeMultiplier?: number;
  adjustsFontSizeToFit?: boolean;
  style?: ReactNative.StyleProp<TextStyle>;
};

/** Every way a text or a field could clip at a large font scale that it uses. */
function clipping(props: TextProps): string[] {
  const style = StyleSheet.flatten(props.style);
  return [
    props.numberOfLines === undefined ? null : 'numberOfLines',
    props.allowFontScaling === false ? 'allowFontScaling' : null,
    props.maxFontSizeMultiplier === undefined ? null : 'maxFontSizeMultiplier',
    props.adjustsFontSizeToFit === true ? 'adjustsFontSizeToFit' : null,
    style.height === undefined ? null : 'height',
    style.maxHeight === undefined ? null : 'maxHeight',
  ].filter((found) => found !== null);
}

/** The screen's texts and fields, each with what clips it; an empty list is the pass. */
function clippedNodes(root: ReturnType<typeof screen.getByTestId>) {
  const nodes = [...root.findAllByType(Text), ...root.findAllByType(TextInput)];
  expect(nodes.length).toBeGreaterThan(3);
  return nodes
    .map((node) => ({ node: String(node.props.testID ?? node.type), found: clipping(node.props) }))
    .filter(({ found }) => found.length > 0);
}

describe('the sign-in screens at the largest text size', () => {
  it('lets every text on the email step wrap, its message included, and the step scroll', () => {
    renderSignIn();
    submitEmail('owner');
    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
    const root = screen.getByTestId('sign-in-screen');

    expect(clippedNodes(root)).toStrictEqual([]);
    expect(root.findAllByType(ScrollView)).toHaveLength(1);
  });

  it('lets every text on the code step wrap, its countdown included, and the step scroll', async () => {
    renderSignIn();
    await reachCodeStep('owner@example.com');
    expect(screen.getByText(/You can send a new code in/)).toBeOnTheScreen();
    const root = screen.getByTestId('code-screen');

    expect(clippedNodes(root)).toStrictEqual([]);
    expect(root.findAllByType(ScrollView)).toHaveLength(1);
  });
});
