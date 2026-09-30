import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  authCalls,
  NO_ERROR,
  reachCodeStep,
  renderSignIn,
  submitEmail,
} from '../../../src/components/testing/signIn';
import { logWarning } from '../../../src/log';

// The email step (app/(auth)/sign-in.tsx). The code step is in code.test.tsx.

jest.mock('../../../src/auth/supabase', () => ({
  supabase: { auth: { signInWithOtp: jest.fn(), verifyOtp: jest.fn() } },
}));
jest.mock('../../../src/log', () => ({ logWarning: jest.fn(), logError: jest.fn() }));

const SEND_FAILED = "Couldn't send a code. Try again in a minute.";
const INVALID_EMAIL = 'Enter a valid email address.';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the email step', () => {
  it('asks for an email, with a field set up for addresses', () => {
    renderSignIn();

    expect(screen.getByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    const field = screen.getByLabelText('Email address');
    expect(field).toHaveProp('autoCapitalize', 'none');
    expect(field).toHaveProp('keyboardType', 'email-address');
    expect(field).toHaveProp('autoComplete', 'email');
    expect(field).toHaveProp('textContentType', 'emailAddress');
    expect(field).toHaveProp('autoCorrect', false);
  });

  it('trims and lower-cases the email, asks Supabase for a code, then shows the code step', async () => {
    const router = renderSignIn();

    await reachCodeStep('  Owner@Example.COM ');

    expect(authCalls().signInWithOtp).toHaveBeenCalledTimes(1);
    expect(authCalls().signInWithOtp).toHaveBeenCalledWith({
      email: 'owner@example.com',
      options: { shouldCreateUser: true },
    });
    expect(router.getPathname()).toBe('/code');
    expect(screen.getByText('We sent a 6-digit code to owner@example.com.')).toBeOnTheScreen();
  });

  it.each([
    '',
    '   ',
    'owner',
    'owner@example',
    '@example.com',
    'owner@.com',
    'own er@example.com',
  ])('refuses %j without calling Supabase', (text) => {
    renderSignIn();

    submitEmail(text);

    expect(screen.getByText(INVALID_EMAIL)).toBeOnTheScreen();
    expect(authCalls().signInWithOtp).not.toHaveBeenCalled();
  });

  it('accepts an email of 254 characters and refuses one of 255', async () => {
    const domain = '@example.com';
    const longest = `${'a'.repeat(254 - domain.length)}${domain}`;
    renderSignIn();

    submitEmail(`b${longest}`);
    expect(screen.getByText(INVALID_EMAIL)).toBeOnTheScreen();
    expect(authCalls().signInWithOtp).not.toHaveBeenCalled();

    await reachCodeStep(longest);
    expect(authCalls().signInWithOtp).toHaveBeenCalledWith({
      email: longest,
      options: { shouldCreateUser: true },
    });
  });

  it('disables Send code while the request runs, so one press sends one code', async () => {
    let answer: (value: typeof NO_ERROR) => void = () => undefined;
    authCalls().signInWithOtp.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderSignIn();

    submitEmail('owner@example.com');
    const sending = screen.getByRole('button', { name: 'Sending…' });
    expect(sending).toBeDisabled();
    fireEvent.press(sending);
    expect(authCalls().signInWithOtp).toHaveBeenCalledTimes(1);

    await act(async () => {
      answer(NO_ERROR);
      await Promise.resolve();
    });
    expect(await screen.findByTestId('code-screen')).toBeOnTheScreen();
  });
});

describe('the email step when Supabase fails', () => {
  const failures = [
    ['an unknown address', new AuthApiError('User not found: owner@example.com', 400, 'x')],
    ['signups turned off', new AuthApiError('Signups not allowed for otp', 422, 'signup_disabled')],
    [
      'a rate limit',
      new AuthApiError('Email rate limit exceeded', 429, 'over_email_send_rate_limit'),
    ],
    ['no network', new AuthRetryableFetchError('Network request failed', 0)],
  ] as const;

  it.each(failures)(
    'shows the same fixed message for %s, never the server text',
    async (_, error) => {
      authCalls().signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error });
      const router = renderSignIn();

      submitEmail('owner@example.com');

      expect(await screen.findByText(SEND_FAILED)).toBeOnTheScreen();
      expect(screen.queryByText(new RegExp(error.message))).toBeNull();
      expect(router.getPathname()).toBe('/sign-in');
      expect(logWarning).toHaveBeenCalledWith('sign_in_send_failed', { kind: error.name });
    },
  );

  it('shows the same message when the call throws, and logs no address', async () => {
    authCalls().signInWithOtp.mockRejectedValue(new Error('owner@example.com unreachable'));
    renderSignIn();

    submitEmail('owner@example.com');

    expect(await screen.findByText(SEND_FAILED)).toBeOnTheScreen();
    expect(JSON.stringify(jest.mocked(logWarning).mock.calls)).not.toContain('owner@');
  });

  it('clears the message when the next try starts', async () => {
    authCalls().signInWithOtp.mockRejectedValueOnce(new Error('offline'));
    renderSignIn();
    submitEmail('owner@example.com');
    await screen.findByText(SEND_FAILED);

    authCalls().signInWithOtp.mockReturnValue(new Promise(() => undefined));
    fireEvent.press(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() => {
      expect(screen.queryByText(SEND_FAILED)).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
  });
});
