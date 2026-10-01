import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import * as ReactNative from 'react-native';
import type { AppStateStatus } from 'react-native';

import { useFeedStore } from '../../feed/store';
import { getAccessToken, onSignOut, signOut, useSession } from '../useSession';

// The Supabase module as every copy of the session module sees it (one mock instance). The copy
// this file imports loads on the fixture source (no client), whatever this run's environment;
// each `load` below sets a client first and loads a fresh copy, which reads it. `afterEach`
// clears it.
jest.mock('../supabase', () => ({ supabase: null, SESSION_STORAGE_KEY: 'doomskill.session' }));
const mockSupabase = jest.requireMock<{ supabase: unknown }>('../supabase');

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
type AppStateListener = (state: AppStateStatus) => void;
type GetSessionResult = { data: { session: Session | null }; error: Error | null };

const STORAGE_KEY = 'doomskill.session';
const TOKEN = 'access-token-marker';

/** A session as supabase-js gives it; only the fields this module reads matter. */
function session(userId: string): Session {
  return {
    access_token: TOKEN,
    refresh_token: 'refresh-token-marker',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '' },
  };
}

/** The part of the Supabase client this module uses, with a way to send its auth events. */
function fakeClient() {
  let listener: AuthListener | undefined;
  const emit = (event: AuthChangeEvent, value: Session | null) => {
    listener?.(event, value);
  };
  const auth = {
    onAuthStateChange: jest.fn((callback: AuthListener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
    getSession: jest.fn((): Promise<GetSessionResult> =>
      Promise.resolve({ data: { session: null }, error: null }),
    ),
    // As supabase-js does: the session is removed and SIGNED_OUT is sent before it returns.
    signOut: jest.fn((): Promise<{ error: Error | null }> => {
      emit('SIGNED_OUT', null);
      return Promise.resolve({ error: null });
    }),
    startAutoRefresh: jest.fn(() => Promise.resolve()),
    stopAutoRefresh: jest.fn(() => Promise.resolve()),
  };
  return { client: { auth }, emit };
}

type FakeClient = ReturnType<typeof fakeClient>;

/**
 * React Native's AppState, starting in `currentState`, with its change listeners collected so a
 * test can send a change.
 */
function fakeAppState(currentState: AppStateStatus): (state: AppStateStatus) => void {
  const listeners: AppStateListener[] = [];
  // React Native's Jest preset makes `currentState` a mock function, which `replaceProperty`
  // refuses; `afterEach` puts it back.
  Reflect.set(ReactNative.AppState, 'currentState', currentState);
  jest.spyOn(ReactNative.AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.push(listener);
    return { remove: jest.fn() };
  });
  return (state) => {
    for (const listener of listeners) listener(state);
  };
}

type Loaded = {
  session: typeof import('../useSession');
  feed: typeof import('../../feed/store');
  secure: { removeItem: jest.Mock };
  change: (state: AppStateStatus) => void;
};

/** Loads the module fresh, with `client` as the Supabase client (null: the fixture source). */
function load(fake: FakeClient | null, appState: AppStateStatus = 'active'): Loaded {
  const change = fakeAppState(appState);
  mockSupabase.supabase = fake?.client ?? null;
  const secure = { removeItem: jest.fn(() => Promise.resolve()) };
  let loaded: Omit<Loaded, 'change' | 'secure'> | undefined;
  jest.isolateModules(() => {
    // The module shares this file's React Native, whose AppState the test controls.
    jest.doMock('react-native', () => ReactNative);
    jest.doMock('../secureSession', () => ({ secureSession: secure }));
    loaded = {
      session: jest.requireActual<typeof import('../useSession')>('../useSession'),
      feed: jest.requireActual<typeof import('../../feed/store')>('../../feed/store'),
    };
  });
  if (loaded === undefined) {
    throw new Error('the session module did not load');
  }
  return { ...loaded, secure, change };
}

let warn: jest.SpiedFunction<typeof console.warn>;
let consoleError: jest.SpiedFunction<typeof console.error>;

beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

const presetCurrentState: unknown = Reflect.get(ReactNative.AppState, 'currentState');

afterEach(() => {
  jest.restoreAllMocks();
  Reflect.set(ReactNative.AppState, 'currentState', presetCurrentState);
  mockSupabase.supabase = null;
});

describe('useSession, the session state', () => {
  it('is loading until Supabase reports the stored session', () => {
    const fake = fakeClient();
    const { session: module } = load(fake);

    expect(module.useSession.getState()).toStrictEqual({ status: 'loading', userId: null });

    fake.emit('INITIAL_SESSION', session('user-1'));

    expect(module.useSession.getState()).toStrictEqual({ status: 'signedIn', userId: 'user-1' });
  });

  it.each<[AuthChangeEvent, Session | null, string]>([
    ['INITIAL_SESSION', null, 'signedOut'],
    ['SIGNED_IN', session('user-1'), 'signedIn'],
    ['TOKEN_REFRESHED', session('user-1'), 'signedIn'],
    ['USER_UPDATED', session('user-1'), 'signedIn'],
    ['SIGNED_OUT', null, 'signedOut'],
  ])('follows %s', (event, value, status) => {
    const fake = fakeClient();
    const { session: module } = load(fake);

    fake.emit(event, value);

    expect(module.useSession.getState()).toStrictEqual({
      status,
      userId: value === null ? null : 'user-1',
    });
  });
});

describe('getAccessToken', () => {
  it('gives the access token of the current session', async () => {
    const fake = fakeClient();
    fake.client.auth.getSession.mockResolvedValue({
      data: { session: session('user-1') },
      error: null,
    });
    const { session: module } = load(fake);

    expect(await module.getAccessToken()).toBe(TOKEN);
  });

  it('gives null without a session', async () => {
    const { session: module } = load(fakeClient());

    expect(await module.getAccessToken()).toBeNull();
  });

  it('signs out when the refresh fails with an auth error', async () => {
    const fake = fakeClient();
    fake.client.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found'),
    });
    const { session: module } = load(fake);
    fake.emit('INITIAL_SESSION', session('user-1'));

    expect(await module.getAccessToken()).toBeNull();
    expect(module.useSession.getState()).toStrictEqual({ status: 'signedOut', userId: null });
  });

  it('stays signed in when the refresh fails for want of a network', async () => {
    const fake = fakeClient();
    fake.client.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Network request failed', 0),
    });
    const { session: module } = load(fake);
    fake.emit('INITIAL_SESSION', session('user-1'));

    expect(await module.getAccessToken()).toBeNull();
    expect(module.useSession.getState()).toStrictEqual({ status: 'signedIn', userId: 'user-1' });
  });

  it('gives null when reading the session throws', async () => {
    const fake = fakeClient();
    fake.client.auth.getSession.mockRejectedValue(new Error('keychain locked'));
    const { session: module } = load(fake);

    expect(await module.getAccessToken()).toBeNull();
  });

  it('never logs the token', async () => {
    const fake = fakeClient();
    fake.client.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError(`bad token ${TOKEN}`, 401, 'bad_jwt'),
    });
    const { session: module } = load(fake);

    await module.getAccessToken();

    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN);
  });
});

describe('token refresh and the app state', () => {
  it('refreshes while the app starts in the foreground', () => {
    const fake = fakeClient();
    load(fake, 'active');

    expect(fake.client.auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(fake.client.auth.stopAutoRefresh).not.toHaveBeenCalled();
  });

  it('stops in the background and starts again in the foreground', () => {
    const fake = fakeClient();
    const { change } = load(fake, 'background');

    expect(fake.client.auth.stopAutoRefresh).toHaveBeenCalledTimes(1);

    change('active');
    expect(fake.client.auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    change('background');
    expect(fake.client.auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
  });

  it('logs a refresh start that fails, and goes on', async () => {
    const fake = fakeClient();
    fake.client.auth.startAutoRefresh.mockRejectedValue(new Error('no storage'));
    load(fake, 'active');
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith('auto_refresh_failed', { kind: 'Error' });
  });
});

describe('signOut', () => {
  function signedIn() {
    const fake = fakeClient();
    const loaded = load(fake);
    fake.emit('INITIAL_SESSION', session('user-1'));
    const listener = jest.fn();
    loaded.session.onSignOut(listener);
    loaded.feed.useFeedStore.setState({ index: 3, streak: 4 });
    return { fake, listener, ...loaded };
  }

  it('signs out of Supabase and clears the feed and the listeners once', async () => {
    const { fake, listener, session: module, feed, secure } = signedIn();

    await module.signOut();

    // This device only: the owner's other devices stay signed in.
    expect(fake.client.auth.signOut).toHaveBeenCalledTimes(1);
    expect(fake.client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(secure.removeItem).not.toHaveBeenCalled();
    expect(module.useSession.getState()).toStrictEqual({ status: 'signedOut', userId: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(feed.useFeedStore.getState()).toMatchObject({ index: 0, streak: 0 });
  });

  it('removes the stored session itself when Supabase could not', async () => {
    const { fake, listener, session: module, secure } = signedIn();
    fake.client.auth.signOut.mockResolvedValue({
      error: new AuthRetryableFetchError('Network request failed', 0),
    });

    await module.signOut();

    expect(secure.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(module.useSession.getState()).toStrictEqual({ status: 'signedOut', userId: null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('still signs out when neither Supabase nor the storage can remove the session', async () => {
    const { fake, listener, session: module, secure } = signedIn();
    fake.client.auth.signOut.mockRejectedValue(new Error('offline'));
    secure.removeItem.mockRejectedValue(new Error('keychain locked'));

    await module.signOut();

    expect(module.useSession.getState()).toStrictEqual({ status: 'signedOut', userId: null });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('session_remove_failed', { kind: 'Error' });
  });

  it('clears the same data when Supabase signs the user out on its own', () => {
    const { fake, listener, feed } = signedIn();

    fake.emit('SIGNED_OUT', null);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(feed.useFeedStore.getState()).toMatchObject({ index: 0, streak: 0 });
  });

  it('stops calling a removed listener, and goes on past one that throws', async () => {
    const { session: module, listener } = signedIn();
    module.onSignOut(() => {
      throw new Error('cache gone');
    });
    const removed = jest.fn();
    module.onSignOut(removed)();
    const last = jest.fn();
    module.onSignOut(last);

    await module.signOut();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(last).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('sign_out_listener_failed', {
      name: 'Error',
      message: 'cache gone',
    });
  });
});

describe('with the fixture source', () => {
  it('is signed out, and never touches Supabase', async () => {
    expect(useSession.getState()).toStrictEqual({ status: 'signedOut', userId: null });
    expect(await getAccessToken()).toBeNull();
  });

  it('signs out by clearing the feed and running the listeners', async () => {
    const listener = jest.fn();
    const remove = onSignOut(listener);
    useFeedStore.setState({ index: 2 });

    await signOut();
    remove();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useFeedStore.getState().index).toBe(0);
    expect(useSession.getState()).toStrictEqual({ status: 'signedOut', userId: null });
  });
});
