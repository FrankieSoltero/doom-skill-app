/**
 * Style readers shared by the component tests. It lives outside `__tests__/` because Jest runs
 * every file there as a suite.
 */
import type { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

/** A rendered element, as the RNTL queries return it. */
export type Element = ReturnType<typeof screen.getByTestId>;

type StyledProps<Style> = { style?: StyleProp<Style> };

/** The flattened style of a rendered view. RNTL 13 types `props` as `any`; name it here. */
export function viewStyleOf(element: Element): ViewStyle {
  const { style } = element.props as StyledProps<ViewStyle>;
  return StyleSheet.flatten(style);
}

/** The flattened style of a rendered text. RNTL 13 types `props` as `any`; name it here. */
export function textStyleOf(element: Element): TextStyle {
  const { style } = element.props as StyledProps<TextStyle>;
  return StyleSheet.flatten(style);
}
