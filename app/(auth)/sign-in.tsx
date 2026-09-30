import { useRouter } from 'expo-router';
import { useState } from 'react';

import { PrimaryButton } from '../../src/components/PrimaryButton';
import { copy } from '../../src/copy';
import { Field, Message, SignInFrame, sendCode, useSignInFlow } from './_layout';

/** The longest address the email standard allows (RFC 5321's path limit, less its brackets). */
const MAX_EMAIL_LENGTH = 254;

/** A simple shape check only: something, `@`, something, a dot, something; no spaces. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `text` trimmed and lower-cased when it looks like an address, else `null`. */
function normalizeEmail(text: string): string | null {
  const email = text.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(email) ? email : null;
}

/**
 * The email step: the address, then Send code. Supabase emails a 6-digit code (creating the
 * account on first use) and the code step opens. Every failure shows one fixed message, the same
 * whether or not the address has an account.
 */
export default function SignInScreen() {
  const flow = useSignInFlow();
  const router = useRouter();
  const [text, setText] = useState(flow.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(): Promise<void> {
    const email = normalizeEmail(text);
    if (email === null) {
      setError(copy.signIn.invalidEmail);
      return;
    }
    setError(null);
    setSending(true);
    const sent = await sendCode(email);
    setSending(false);
    if (!sent) {
      setError(copy.signIn.sendFailed);
      return;
    }
    flow.codeSent(email);
    router.push('/code');
  }

  const notice = flow.notice === 'tooManyTries' ? copy.signIn.tooManyTries : null;

  return (
    <SignInFrame testID="sign-in-screen" title={copy.signIn.title} intro={copy.signIn.emailIntro}>
      <Field
        label={copy.signIn.emailLabel}
        placeholder={copy.signIn.emailPlaceholder}
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => void submit()}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        returnKeyType="send"
        editable={!sending}
      />
      <Message text={error ?? notice} />
      <PrimaryButton
        label={sending ? copy.signIn.sending : copy.signIn.sendCode}
        onPress={() => void submit()}
        disabled={sending}
      />
    </SignInFrame>
  );
}
