import { render, screen } from '@testing-library/react-native';

// The root layout with a configuration problem (src/config.ts). Its other states, with the
// configuration the test run has (none, so the demo cards), are in layout.test.tsx.

jest.mock('../../src/config', () => ({
  config: { apiUrl: '', supabaseUrl: '', supabaseAnonKey: '', dataSource: 'api' },
  configError: 'EXPO_PUBLIC_API_URL: not an allowed URL',
}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Stack: () => createElement(View, { testID: 'routes' }) };
});

const RootLayout = jest.requireActual<typeof import('../_layout')>('../_layout').default;

describe('RootLayout with a configuration problem', () => {
  it('shows the fixed message in place of the routes, without the problem or a Retry', () => {
    render(<RootLayout />);

    expect(screen.getByTestId('error-screen')).toBeOnTheScreen();
    expect(screen.getByText("The app isn't set up to reach its server.")).toBeOnTheScreen();
    expect(screen.queryByTestId('routes')).toBeNull();
    expect(screen.queryByText(/EXPO_PUBLIC/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
