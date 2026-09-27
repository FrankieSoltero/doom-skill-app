import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { colors } from '../../src/theme';
import HomeScreen from '../index';

// React Native Testing Library types every host prop as `any`; name the style prop's real type.
type StyledProps<Style> = { style?: StyleProp<Style> };

describe('HomeScreen', () => {
  it('renders the LearnLoop title inside the home-screen view', () => {
    render(<HomeScreen />);

    const homeScreen = screen.getByTestId('home-screen');

    expect(within(homeScreen).getByText('LearnLoop')).toBeOnTheScreen();
  });

  it('fills the screen with the paper background from the theme', () => {
    render(<HomeScreen />);

    const { style } = screen.getByTestId('home-screen').props as StyledProps<ViewStyle>;

    expect(StyleSheet.flatten(style)).toMatchObject({ flex: 1, backgroundColor: colors.paper });
  });

  it('draws the LearnLoop title in the ink color from the theme', () => {
    render(<HomeScreen />);

    const { style } = screen.getByText('LearnLoop').props as StyledProps<TextStyle>;

    expect(StyleSheet.flatten(style)).toMatchObject({ color: colors.ink });
  });
});
