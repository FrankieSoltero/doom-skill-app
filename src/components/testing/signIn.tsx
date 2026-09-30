/**
 * Shared setup for the sign-in screen tests (`app/(auth)/__tests__/`, and the root layout's
 * `app/__tests__/layoutSession.test.tsx`). It lives outside `__tests__/` because Jest runs every
 * file there as a suite. Tests that use it mock `src/auth/supabase` with a client whose `auth`
 * has `signInWithOtp` and `verifyOtp` as `jest.fn()`. Expo Router's test renderer supplies the
 * safe-area insets.
 */
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import AuthLayout from '../../../app/(auth)/_layout';
import CodeScreen from '../../../app/(auth)/code';
import SignInScreen from '../../../app/(auth)/sign-in';
import type { supabase } from '../../auth/supabase';

/** The sign-in routes as Expo Router reads them from `app/`. */
export const AUTH_ROUTES = {
  '(auth)/_layout': AuthLayout,
  '(auth)/sign-in': SignInScreen,
  '(auth)/code': CodeScreen,
};

type Auth = NonNullable<typeof supabase>['auth'];

type AuthMock = {
  supabase: {
    auth: {
      signInWithOtp: jest.MockedFunction<Auth['signInWithOtp']>;
      verifyOtp: jest.MockedFunction<Auth['verifyOtp']>;
    };
  };
};

/** The two Supabase calls the screens make, as the test file's mock gives them. */
export function authCalls() {
  return jest.requireMock<AuthMock>('../../auth/supabase').supabase.auth;
}

/** Supabase's answer to a call that worked; the screens read only `error`. */
export const NO_ERROR = { data: { user: null, session: null }, error: null };

/** Renders the sign-in routes at `initialUrl`. */
export function renderSignIn(initialUrl = '/sign-in') {
  return renderRouter(AUTH_ROUTES, { initialUrl });
}

/** Types `text` into the email field and presses Send code. */
export function submitEmail(text: string): void {
  fireEvent.changeText(screen.getByLabelText('Email address'), text);
  fireEvent.press(screen.getByRole('button', { name: 'Send code' }));
}

/** From the email step, sends a code to `email` (Supabase agreeing) and waits for the code step. */
export async function reachCodeStep(email: string): Promise<void> {
  authCalls().signInWithOtp.mockResolvedValue(NO_ERROR);
  submitEmail(email);
  await screen.findByTestId('code-screen');
}

/** Types `code` into the code field and presses Sign in. */
export function submitCode(code: string): void {
  fireEvent.changeText(screen.getByLabelText('6-digit code'), code);
  fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
}
