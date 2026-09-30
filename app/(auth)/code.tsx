import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { supabase } from '../../src/auth/supabase';
import { OutlineButton } from '../../src/components/OutlineButton';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { copy } from '../../src/copy';
import { logWarning } from '../../src/log';
import { colors, type } from '../../src/theme';
import { Field, Message, SignInFrame, sendCode, useSignInFlow } from './_layout';

/** The wait before another code may be sent, in seconds. */
const RESEND_SECONDS = 60;

/** Wrong codes allowed before the flow returns to the email step. */
const MAX_WRONG_CODES = 5;

/** Exactly six digits: the code Supabase emails. */
const CODE_SHAPE = /^\d{6}$/;

type Verdict = 'ok' | 'wrong' | 'failed';

/**
 * Checks `token` with Supabase for `email`. `failed` when Supabase could not be reached (that
 * does not count as a wrong code), `wrong` for any refusal. Logged by class name only.
 */
async function verifyCode(email: string, token: string): Promise<Verdict> {
  if (supabase === null) {
    return 'failed';
  }
  try {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error === null) {
      return 'ok';
    }
    logWarning('sign_in_verify_failed', { kind: error.name });
    return isAuthRetryableFetchError(error) ? 'failed' : 'wrong';
  } catch (error) {
    logWarning('sign_in_verify_failed', {
      kind: error instanceof Error ? error.name : typeof error,
    });
    return 'failed';
  }
}

/** Whole seconds until `until` (a `Date.now()` time), 0 to `RESEND_SECONDS`, ticking each second. */
function useSecondsUntil(until: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return Math.min(RESEND_SECONDS, Math.max(0, Math.ceil((until - now) / 1000)));
}

/** The code step's state and actions, for the address the code went to. */
function useCodeStep(email: string) {
  const flow = useSignInFlow();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function backToEmail(notice: 'tooManyTries' | null): void {
    flow.restart(notice);
    router.dismissTo('/sign-in');
  }

  async function verify(): Promise<void> {
    if (!CODE_SHAPE.test(code)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const verdict = await verifyCode(email, code);
    if (verdict === 'ok') {
      return; // The root layout shows the tabs once Supabase reports the session.
    }
    setBusy(false);
    if (verdict === 'failed') {
      setMessage(copy.signIn.verifyFailed);
      return;
    }
    if (wrong + 1 >= MAX_WRONG_CODES) {
      backToEmail('tooManyTries');
      return;
    }
    setWrong(wrong + 1);
    setCode('');
    setMessage(copy.signIn.wrongCode);
  }

  async function resend(): Promise<void> {
    setBusy(true);
    const sent = await sendCode(email);
    setBusy(false);
    if (sent) {
      flow.codeSent(email);
    }
    setMessage(sent ? copy.signIn.codeResent : copy.signIn.sendFailed);
  }

  return {
    code,
    setCode: (text: string) => {
      setCode(text.replace(/\D/g, '').slice(0, 6));
    },
    message,
    busy,
    secondsLeft: useSecondsUntil(flow.sentAt + RESEND_SECONDS * 1000),
    verify,
    resend,
    backToEmail,
  };
}

/** The code step for `email`: the 6 digits, Sign in, and a new code after the wait. */
function CodeStep({ email }: { email: string }) {
  const step = useCodeStep(email);

  return (
    <SignInFrame
      testID="code-screen"
      title={copy.signIn.codeTitle}
      intro={copy.signIn.codeIntro(email)}
    >
      <Field
        label={copy.signIn.codeLabel}
        value={step.code}
        onChangeText={step.setCode}
        onSubmitEditing={() => void step.verify()}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        editable={!step.busy}
        variant="code"
      />
      <Message text={step.message} />
      <PrimaryButton
        label={step.busy ? copy.signIn.verifying : copy.signIn.verify}
        onPress={() => void step.verify()}
        disabled={step.busy || !CODE_SHAPE.test(step.code)}
      />
      <OutlineButton
        label={copy.signIn.resend}
        onPress={() => void step.resend()}
        disabled={step.busy || step.secondsLeft > 0}
      />
      {step.secondsLeft > 0 ? (
        <Text style={styles.wait}>{copy.signIn.resendIn(step.secondsLeft)}</Text>
      ) : null}
      <OutlineButton
        label={copy.signIn.changeEmail}
        onPress={() => {
          step.backToEmail(null);
        }}
        disabled={step.busy}
      />
    </SignInFrame>
  );
}

/**
 * The code step. Opened without an address (the email step sets it), it sends the person to the
 * email step. After 5 wrong codes it returns there with a notice.
 */
export default function CodeScreen() {
  const { email } = useSignInFlow();
  return email === null ? <Redirect href="/sign-in" /> : <CodeStep email={email} />;
}

const styles = StyleSheet.create({
  wait: { ...type.small, color: colors.neutral[700] },
});
