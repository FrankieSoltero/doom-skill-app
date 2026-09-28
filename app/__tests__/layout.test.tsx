import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { viewStyleOf } from '../../src/components/testing/styles';
import { logError, logWarning } from '../../src/log';
import { colors, fonts } from '../../src/theme';

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
// Set by a test to make the routes throw while rendering; read by the Stack mock on every render.
let mockRoutesThrow = false;
const mockRoutesError = new Error('routes broke');

jest.mock('expo-router', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Stack: jest.fn(() => {
      if (mockRoutesThrow) {
        throw mockRoutesError;
      }
      return createElement(Text, { testID: 'routes' }, 'routes');
    }),
  };
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
  jest.mocked(Stack).mockClear();
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

describe('RootLayout stack', () => {
  /** The screen options the layout gave the stack on its last render. */
  function stackScreenOptions(): unknown {
    const [props] = jest.mocked(Stack).mock.lastCall ?? [];
    return props?.screenOptions;
  }

  it('hides the navigation header, so the tabs draw their own shell', () => {
    fontState(true, null);

    render(<RootLayout />);

    expect(stackScreenOptions()).toMatchObject({ headerShown: false });
  });

  it('draws the stack content on paper, so no white frame shows before the first screen', () => {
    fontState(true, null);

    render(<RootLayout />);

    expect(stackScreenOptions()).toMatchObject({ contentStyle: { backgroundColor: colors.paper } });
  });
});

describe('RootLayout gesture root', () => {
  it('wraps the routes and the status bar in a gesture root that fills the screen', () => {
    fontState(true, null);

    render(<RootLayout />);

    const root = screen.UNSAFE_getByType(GestureHandlerRootView);
    expect(viewStyleOf(root)).toStrictEqual({ flex: 1 });
    expect(within(root).getByTestId('routes')).toBeOnTheScreen();
    expect(within(root).getByTestId('status-bar')).toBeOnTheScreen();
  });
});

describe('RootLayout error boundary', () => {
  let consoleError: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    mockRoutesThrow = true;
    fontState(true, null);
    // React reports every error a boundary catches through console.error; keep the run quiet.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    mockRoutesThrow = false;
    consoleError.mockRestore();
  });

  it('shows the crash screen with Retry inside the app root when the routes throw', () => {
    render(<RootLayout />);

    const root = screen.UNSAFE_getByType(GestureHandlerRootView);
    expect(within(root).getByText('Something went wrong.')).toBeOnTheScreen();
    expect(within(root).getByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    expect(within(root).getByTestId('status-bar')).toBeOnTheScreen();
    expect(screen.queryByTestId('routes')).toBeNull();
  });

  it('draws the crash screen on the paper ground, filling the screen', () => {
    render(<RootLayout />);

    expect(viewStyleOf(screen.getByTestId('error-screen'))).toMatchObject({
      flex: 1,
      backgroundColor: colors.paper,
    });
  });

  it('logs the error once, with the boundary named root', () => {
    render(<RootLayout />);

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith('render_failed', mockRoutesError, { boundary: 'root' });
  });

  it('renders the routes again when Retry is pressed', () => {
    render(<RootLayout />);

    mockRoutesThrow = false;
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByTestId('routes')).toBeOnTheScreen();
    expect(screen.queryByText('Something went wrong.')).toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
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
