import { render, screen, within } from '@testing-library/react-native';

import HomeScreen from '../index';

describe('HomeScreen', () => {
  it('renders the LearnLoop title inside the home-screen view', () => {
    render(<HomeScreen />);

    const homeScreen = screen.getByTestId('home-screen');

    expect(within(homeScreen).getByText('LearnLoop')).toBeOnTheScreen();
  });
});
