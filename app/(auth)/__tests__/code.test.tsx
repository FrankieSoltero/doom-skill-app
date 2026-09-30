import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import type { AuthError } from '@supabase/supabase-js';
import { act, fireEvent, screen } from 'expo-router/testing-library';

import {
  authCalls,
  NO_ERROR,
  reachCodeStep,
  renderSignIn,
  submitCode,
} from '../../../src/components/testing/signIn';

// The code step (app/(auth)/code.tsx), reached from the email step as a person reaches it.

jest.mock('../../../src/auth/supabase', () => ({
  supabase: { auth: { verifyOtp: jest.fn(), signInWithOtp: jest.fn() } },
}));
jest.mock('../../../src/log');

const EMAIL = 'owner@example.com';
const WRONG_CODE = "That code didn't work. Check it, or send a new one.";
const EXPIRED = new AuthApiError('Token has expired or is invalid', 403, 'otp_expired');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function atCodeStep() {
  const router = renderSignIn();
  await reachCodeStep(EMAIL);
  return router;
}

function failVerify(error: AuthError): void {
  authCalls().verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error });
}

describe('the code step', () => {
  it('names the address and sets the field up for a one-time code', async () => {
    await atCodeStep();

    expect(screen.getByRole('header', { name: 'Enter your code' })).toBeOnTheScreen();
    expect(screen.getByText(`We sent a 6-digit code to ${EMAIL}.`)).toBeOnTheScreen();
    const field = screen.getByLabelText('6-digit code');
    expect(field).toHaveProp('textContentType', 'oneTimeCode');
    expect(field).toHaveProp('autoComplete', 'one-time-code');
    expect(field).toHaveProp('keyboardType', 'number-pad');
    expect(field).toHaveProp('maxLength', 6);
  });

  it('enables Sign in only with exactly 6 digits, keeping digits only', async () => {
    await atCodeStep();
    const field = screen.getByLabelText('6-digit code');

    fireEvent.changeText(field, '12345');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();

    fireEvent.changeText(field, '12 34-56');
    expect(field).toHaveProp('value', '123456');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('checks the code with Supabase for the address the code went to', async () => {
    authCalls().verifyOtp.mockResolvedValue(NO_ERROR);
    await atCodeStep();

    submitCode('123456');
    await act(async () => {
      await Promise.resolve();
    });

    expect(authCalls().verifyOtp).toHaveBeenCalledWith({
      email: EMAIL,
      token: '123456',
      type: 'email',
    });
  });

  it('shows one fixed message for a wrong or expired code, never the server text', async () => {
    failVerify(EXPIRED);
    await atCodeStep();

    submitCode('123456');

    expect(await screen.findByText(WRONG_CODE)).toBeOnTheScreen();
    expect(screen.queryByText(/expired or is invalid/)).toBeNull();
    expect(screen.getByLabelText('6-digit code')).toHaveProp('value', '');
  });

  it('returns to the email step after 5 wrong codes, keeping the address', async () => {
    failVerify(EXPIRED);
    const router = await atCodeStep();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      submitCode('123456');
      await screen.findByText(WRONG_CODE);
    }
    expect(router.getPathname()).toBe('/code');

    submitCode('123456');

    expect(await screen.findByText('Too many wrong codes. Send a new one.')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
    expect(screen.getByLabelText('Email address')).toHaveProp('value', EMAIL);
    expect(authCalls().verifyOtp).toHaveBeenCalledTimes(5);
  });

  it('shows a fixed message when Supabase cannot be reached, and does not count it', async () => {
    failVerify(new AuthRetryableFetchError('Network request failed', 0));
    const router = await atCodeStep();

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      submitCode('123456');
      await screen.findByText("Couldn't reach the server. Try again.");
    }

    expect(router.getPathname()).toBe('/code');
  });

  it('goes back to the email step on Use a different email', async () => {
    const router = await atCodeStep();

    fireEvent.press(screen.getByRole('button', { name: 'Use a different email' }));

    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
  });

  it('sends a person who opens it without an address to the email step', async () => {
    const router = renderSignIn('/code');

    expect(await screen.findByTestId('sign-in-screen')).toBeOnTheScreen();
    expect(router.getPathname()).toBe('/sign-in');
  });
});

describe('sending the code again', () => {
  it('waits 60 seconds, counting down, then sends a new code to the same address', async () => {
    await atCodeStep();
    const resend = () => screen.getByRole('button', { name: 'Send a new code' });

    expect(resend()).toBeDisabled();
    expect(screen.getByText('You can send a new code in 60 s.')).toBeOnTheScreen();

    act(() => {
      jest.advanceTimersByTime(59_000);
    });
    expect(screen.getByText('You can send a new code in 1 s.')).toBeOnTheScreen();
    expect(resend()).toBeDisabled();

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText(/You can send a new code in/)).toBeNull();
    fireEvent.press(resend());

    expect(await screen.findByText('A new code is on its way.')).toBeOnTheScreen();
    expect(authCalls().signInWithOtp).toHaveBeenCalledTimes(2);
    expect(authCalls().signInWithOtp).toHaveBeenLastCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: true },
    });
    expect(resend()).toBeDisabled();
    expect(screen.getByText('You can send a new code in 60 s.')).toBeOnTheScreen();
  });

  it('shows the fixed message when the new code cannot be sent', async () => {
    await atCodeStep();
    authCalls().signInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('Email rate limit exceeded', 429, 'over_email_send_rate_limit'),
    });

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    fireEvent.press(screen.getByRole('button', { name: 'Send a new code' }));

    expect(
      await screen.findByText("Couldn't send a code. Try again in a minute."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/rate limit/)).toBeNull();
  });
});
