import { render, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';

import { logError, logWarning } from '../../src/log';
import { fonts } from '../../src/theme';

/** A rejected promise that reports whether anyone attached a rejection handler to it. */
function trackedRejection(): { promise: Promise<never>; handled: () => boolean } {
  const promise = Promise.reject(new Error('splash screen unavailable'));
  const then = jest.spyOn(promise, 'then');
  return {
    promise,
    handled: () => then.mock.calls.some(([, onRejected]) => typeof onRejected === 'function'),
  };
}

// Read by the splash-screen mock when the layout module calls preventAutoHideAsync at load.
const mockPreventRejection = trackedRejection();

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => mockPreventRejection.promise),
  hideAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [false, null]) }));
jest.mock('@expo-google-fonts/barlow', () => ({
  Barlow_400Regular: 401,
  Barlow_500Medium: 501,
  Barlow_700Bold: 701,
}));
jest.mock('@expo-google-fonts/barlow-condensed', () => ({ BarlowCondensed_600SemiBold: 601 }));
jest.mock('../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));
jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Stack: () => createElement(Text, { testID: 'routes' }, 'routes') };
});
jest.mock('expo-status-bar', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    StatusBar: ({ style }: { style?: string }) =>
      createElement(Text, { testID: 'status-bar' }, style),
  };
});

// Loaded after the mocks' shared state exists: the module calls preventAutoHideAsync on load.
const RootLayout = jest.requireActual<typeof import('../_layout')>('../_layout').default;
const preventCallsAtLoad = jest.mocked(preventAutoHideAsync).mock.calls.length;

function fontState(loaded: boolean, error: Error | null): void {
  jest.mocked(useFonts).mockReturnValue([loaded, error]);
}

beforeEach(() => {
  jest.mocked(useFonts).mockClear();
  jest.mocked(hideAsync).mockClear();
  jest.mocked(logWarning).mockClear();
  jest.mocked(logError).mockClear();
});

describe('RootLayout splash screen', () => {
  it('keeps the splash screen up once, when the module loads, and handles its rejection', () => {
    expect(preventCallsAtLoad).toBe(1);
    expect(mockPreventRejection.handled()).toBe(true);
  });

  it('does not ask to keep the splash screen up again on render', () => {
    fontState(true, null);
    render(<RootLayout />);

    expect(preventAutoHideAsync).toHaveBeenCalledTimes(1);
  });

  it('handles a rejected hideAsync without logging', () => {
    const rejection = trackedRejection();
    jest.mocked(hideAsync).mockReturnValueOnce(rejection.promise);
    fontState(true, null);

    render(<RootLayout />);

    expect(rejection.handled()).toBe(true);
    expect(logWarning).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});

describe('RootLayout font states', () => {
  it('renders nothing and keeps the splash screen up while fonts load', () => {
    fontState(false, null);

    render(<RootLayout />);

    expect(screen.toJSON()).toBeNull();
    expect(hideAsync).not.toHaveBeenCalled();
  });

  it('renders the routes and hides the splash screen once fonts load', () => {
    fontState(true, null);

    render(<RootLayout />);

    expect(screen.getByTestId('routes')).toBeOnTheScreen();
    expect(hideAsync).toHaveBeenCalledTimes(1);
    expect(logWarning).not.toHaveBeenCalled();
  });

  it('renders the routes, hides the splash screen and warns once when fonts fail', () => {
    fontState(false, new Error('font download failed'));

    render(<RootLayout />);

    expect(screen.getByTestId('routes')).toBeOnTheScreen();
    expect(hideAsync).toHaveBeenCalledTimes(1);
    expect(logWarning).toHaveBeenCalledTimes(1);
    expect(logWarning).toHaveBeenCalledWith('fonts_failed');
  });

  it('does not warn again when the layout re-renders with the same font error', () => {
    fontState(false, new Error('font download failed'));

    const { rerender } = render(<RootLayout />);
    rerender(<RootLayout />);

    expect(logWarning).toHaveBeenCalledTimes(1);
  });

  it('draws dark status bar content', () => {
    fontState(true, null);

    render(<RootLayout />);

    expect(screen.getByTestId('status-bar')).toHaveTextContent('dark');
  });
});

describe('RootLayout font faces', () => {
  const briefFaces = [
    'BarlowCondensed_600SemiBold',
    'Barlow_400Regular',
    'Barlow_500Medium',
    'Barlow_700Bold',
  ];

  it('loads exactly the four Barlow faces from the font packages', () => {
    render(<RootLayout />);

    expect(useFonts).toHaveBeenCalledWith({
      BarlowCondensed_600SemiBold: 601,
      Barlow_400Regular: 401,
      Barlow_500Medium: 501,
      Barlow_700Bold: 701,
    });
  });

  it('names each face as the theme names it', () => {
    const themeFaces = [fonts.heading, fonts.body, fonts.bodyMedium, fonts.bodyBold];

    render(<RootLayout />);

    const [faceMap] = jest.mocked(useFonts).mock.calls[0] ?? [];
    const loadedFaces = typeof faceMap === 'object' ? Object.keys(faceMap).sort() : [];
    expect(loadedFaces).toEqual([...themeFaces].sort());
    expect(loadedFaces).toEqual([...briefFaces].sort());
  });
});
