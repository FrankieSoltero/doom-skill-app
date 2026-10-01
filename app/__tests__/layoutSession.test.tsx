import { router, Slot } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { useSession } from '../../src/auth/useSession';
import { colors } from '../../src/theme';
import { viewStyleOf } from '../../src/components/testing/styles';
import { AUTH_ROUTES } from '../../src/components/testing/signIn';

// The root layout's choice between the sign-in screens and the tabs (app/_layout.tsx). The tabs
// are a stand-in here; tabs.test.tsx covers them. Its font, splash and error states are in
// layout.test.tsx and layoutConfig.test.tsx.

// Read by the config mock: each test sets the data source it runs with.
const mockConfig = { apiUrl: '', supabaseUrl: '', supabaseAnonKey: '', dataSource: 'api' };

jest.mock('../../src/config', () => ({ config: mockConfig, configError: null }));
jest.mock('../../src/auth/useSession', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return {
    useSession: create(() => ({ status: 'loading', userId: null })),
    // The server-state cache (src/api/query.ts), which the layout provides, registers here.
    onSignOut: () => () => undefined,
  };
});
jest.mock('../../src/auth/supabase', () => ({
  supabase: { auth: { signInWithOtp: jest.fn(), verifyOtp: jest.fn() } },
}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: () => Promise.resolve(),
  hideAsync: () => Promise.resolve(),
}));

// Loaded after the mocks, as the other layout tests do.
const RootLayout = jest.requireActual<typeof import('../_layout')>('../_layout').default;

/** The tabs' stand-in. */
function TodayStandIn() {
  return <Text testID="today-screen">today</Text>;
}

/** The topic detail screen's stand-in. */
function TopicStandIn() {
  return <Text testID="topic-screen">topic</Text>;
}

const ROUTES = {
  _layout: RootLayout,
  '(tabs)/_layout': () => <Slot />,
  '(tabs)/index': TodayStandIn,
  'topic/[slug]': TopicStandIn,
  ...AUTH_ROUTES,
};

type Status = 'loading' | 'signedOut' | 'signedIn';

function sessionIs(status: Status): void {
  useSession.setState({ status, userId: status === 'signedIn' ? 'user-1' : null });
}

/** Tries to open `path`: the screen `staysOn` stays, and `unreachable` does not show. */
function expectRefused(path: string, staysOn: string, unreachable: string): void {
  act(() => {
    router.push(path);
  });
  expect(screen.getByTestId(staysOn)).toBeOnTheScreen();
  expect(screen.queryByTestId(unreachable)).toBeNull();
}

beforeEach(() => {
  mockConfig.dataSource = 'api';
  sessionIs('loading');
});

describe('RootLayout with the API source', () => {
  it('shows only the paper ground while the session loads', () => {
    renderRouter(ROUTES, { initialUrl: '/' });

    expect(viewStyleOf(screen.getByTestId('session-loading'))).toMatchObject({
      flex: 1,
      backgroundColor: colors.paper,
    });
    expect(screen.queryByTestId('today-screen')).toBeNull();
    expect(screen.queryByTestId('sign-in-screen')).toBeNull();
  });

  it('shows the email step when signed out, and the tabs cannot be reached', async () => {
    sessionIs('signedOut');
    const rendered = renderRouter(ROUTES, { initialUrl: '/' });

    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('today-screen')).toBeNull();

    expectRefused('/', 'sign-in-screen', 'today-screen');
    expectRefused('/topic/strudel', 'sign-in-screen', 'topic-screen');
    expect(rendered.getSegments()).toStrictEqual(['(auth)']);
  });

  it("opens a topic's detail once signed in", async () => {
    sessionIs('signedIn');
    const rendered = renderRouter(ROUTES, { initialUrl: '/' });
    await screen.findByTestId('today-screen');

    act(() => {
      router.push('/topic/strudel');
    });

    expect(await screen.findByTestId('topic-screen')).toBeOnTheScreen();
    expect(rendered.getPathname()).toBe('/topic/strudel');
  });

  it('shows the tabs once signed in, and the sign-in screens cannot be reached', async () => {
    sessionIs('signedOut');
    const rendered = renderRouter(ROUTES, { initialUrl: '/' });
    await screen.findByTestId('sign-in-screen');

    act(() => {
      sessionIs('signedIn');
    });

    expect(await screen.findByTestId('today-screen')).toBeOnTheScreen();
    expectRefused('/sign-in', 'today-screen', 'sign-in-screen');
    expect(rendered.getPathname()).toBe('/');
  });

  it('returns to the email step when the session ends', async () => {
    sessionIs('signedIn');
    renderRouter(ROUTES, { initialUrl: '/' });
    await screen.findByTestId('today-screen');

    act(() => {
      sessionIs('signedOut');
    });

    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('today-screen')).toBeNull();
  });
});

describe('RootLayout with the fixture source', () => {
  it('shows the tabs with no sign-in, as before', async () => {
    mockConfig.dataSource = 'fixture';
    sessionIs('signedOut');
    const rendered = renderRouter(ROUTES, { initialUrl: '/' });

    expect(await screen.findByTestId('today-screen')).toBeOnTheScreen();
    expectRefused('/sign-in', 'today-screen', 'sign-in-screen');
    expect(rendered.getPathname()).toBe('/');
  });
});
