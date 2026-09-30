/**
 * The signed-in state, for screens (`useSession`) and for the API client (`getAccessToken`).
 *
 * The state follows the Supabase client's auth events (`onAuthStateChange`): `loading` until the
 * client has read the stored session, then `signedIn` with the user's id, or `signedOut`. With the
 * fixture source there is no client, and the state is `signedOut` from the start.
 *
 * When the user who was signed in is no longer (a sign-out here, or the client removing a session
 * whose refresh the server refused), their data is cleared: the feed store is reset, and every
 * `onSignOut` listener runs. The server-state cache (TanStack Query) registers one when it is
 * created.
 *
 * The access token is never logged, and neither is any other part of the session: a failure logs
 * the error's class name only.
 */
import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { useFeedStore } from '../feed/store';
import { logError, logWarning } from '../log';
import { secureSession } from './secureSession';
import { SESSION_STORAGE_KEY, supabase } from './supabase';

type SessionState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  userId: string | null;
};

const SIGNED_OUT: SessionState = { status: 'signedOut', userId: null };

/** The session state; a screen reads it with `useSession()`. */
export const useSession = create<SessionState>()(() =>
  supabase === null ? SIGNED_OUT : { status: 'loading', userId: null },
);

const signOutListeners = new Set<() => void>();

/**
 * Runs `listener` each time a signed-in user's data must be cleared (see the module comment).
 * Returns the function that removes it.
 */
export function onSignOut(listener: () => void): () => void {
  signOutListeners.add(listener);
  return () => {
    signOutListeners.delete(listener);
  };
}

/** The class name of a failure, the only part of it that is logged. */
function kindOf(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function clearUserData(): void {
  useFeedStore.getState().reset();
  for (const listener of signOutListeners) {
    try {
      listener();
    } catch (error) {
      logError('sign_out_listener_failed', error);
    }
  }
}

/** Sets the state from the client's session, clearing the data of a user who has left. */
function applySession(session: Session | null): void {
  const previous = useSession.getState().userId;
  const next: SessionState =
    session === null ? SIGNED_OUT : { status: 'signedIn', userId: session.user.id };
  useSession.setState(next);
  if (previous !== null && previous !== next.userId) {
    clearUserData();
  }
}

/**
 * True when the server refused the session: an auth error that is not a network or server
 * failure (those keep the session for a later retry).
 */
function isRefused(error: unknown): boolean {
  return isAuthError(error) && !isAuthRetryableFetchError(error);
}

/**
 * The current access token, refreshed first when it is about to expire, or `null` when there is
 * no usable session. A refresh the server refuses signs the user out.
 */
export async function getAccessToken(): Promise<string | null> {
  if (supabase === null) {
    return null;
  }
  try {
    // With an error there is no session: supabase-js returns one only when it is still usable.
    const { data, error } = await supabase.auth.getSession();
    if (error !== null) {
      logWarning('session_refresh_failed', { kind: kindOf(error) });
      if (isRefused(error)) {
        applySession(null);
      }
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (error) {
    logWarning('session_read_failed', { kind: kindOf(error) });
    return null;
  }
}

/**
 * Signs out: Supabase removes the stored session (and revokes it on the server), and the user's
 * data is cleared once. When Supabase fails (for example offline with an expired token), the
 * stored session is removed here, so the next launch starts signed out.
 */
export async function signOut(): Promise<void> {
  const hadUser = useSession.getState().userId !== null;
  if (supabase !== null) {
    let failed: unknown = null;
    try {
      failed = (await supabase.auth.signOut()).error;
    } catch (error) {
      failed = error;
    }
    if (failed !== null) {
      logWarning('sign_out_failed', { kind: kindOf(failed) });
      await secureSession.removeItem(SESSION_STORAGE_KEY).catch((error: unknown) => {
        logWarning('session_remove_failed', { kind: kindOf(error) });
      });
    }
  }
  applySession(null);
  if (!hadUser) {
    clearUserData();
  }
}

type AuthClient = NonNullable<typeof supabase>['auth'];

function logRefreshFailure(error: unknown): void {
  logWarning('auto_refresh_failed', { kind: kindOf(error) });
}

/** Token refresh runs while the app is in the foreground and stops in the background. */
function followAppState(auth: AuthClient, state: AppStateStatus): void {
  const change = state === 'active' ? auth.startAutoRefresh() : auth.stopAutoRefresh();
  change.catch(logRefreshFailure);
}

if (supabase !== null) {
  const { auth } = supabase;
  auth.onAuthStateChange((_event, session) => {
    applySession(session);
  });
  followAppState(auth, AppState.currentState);
  AppState.addEventListener('change', (state) => {
    followAppState(auth, state);
  });
}
