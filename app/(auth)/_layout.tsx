/**
 * The sign-in group: the email step (`sign-in`), then the code step (`code`). The root layout
 * shows it only with the API source and no session; once Supabase reports a session, the root
 * layout shows the tabs instead, so the code step does not navigate on success.
 *
 * The layout holds the flow's state for both steps, in memory only: the address the code went to,
 * when it went, and why the email step is shown again. The address is never put in a route, a
 * log line or storage, and it is gone once the group closes.
 *
 * It also holds what both steps share: the Supabase call that sends a code, and the frame, field
 * and message the two screens are drawn with.
 */
import { Stack } from 'expo-router';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '../../src/auth/supabase';
import { announce } from '../../src/components/announce';
import { BUTTON_HEIGHT } from '../../src/components/PrimaryButton';
import { logWarning } from '../../src/log';
import { border, colors, fonts, space, type } from '../../src/theme';

/** Why the email step is shown again: after 5 wrong codes, or not at all. */
type Notice = 'tooManyTries' | null;

type SignInFlow = {
  /** The address the last code went to; `null` until one was sent. */
  email: string | null;
  /** When the last code went (`Date.now()`), for the wait before another. */
  sentAt: number;
  notice: Notice;
  /** Records a code sent to `email` now, and clears the notice. */
  codeSent: (email: string) => void;
  /** Sets the notice the email step shows when the flow returns to it. */
  restart: (notice: Notice) => void;
};

type FlowState = Pick<SignInFlow, 'email' | 'sentAt' | 'notice'>;

const START: FlowState = { email: null, sentAt: 0, notice: null };

const SignInFlowContext = createContext<SignInFlow | null>(null);

/** The flow's state, for the two sign-in screens. */
export function useSignInFlow(): SignInFlow {
  const flow = useContext(SignInFlowContext);
  if (flow === null) {
    throw new Error('useSignInFlow is used outside the sign-in layout');
  }
  return flow;
}

/** The screens draw their own titles, on the paper ground. */
const STACK_OPTIONS = { headerShown: false, contentStyle: { backgroundColor: colors.paper } };

/** The email step comes first, whatever route opened the group. */
export const unstable_settings = { initialRouteName: 'sign-in' };

export default function AuthLayout() {
  const [state, setState] = useState<FlowState>(START);
  const flow = useMemo<SignInFlow>(
    () => ({
      ...state,
      codeSent: (email) => {
        setState({ email, sentAt: Date.now(), notice: null });
      },
      restart: (notice) => {
        setState((current) => ({ ...current, notice }));
      },
    }),
    [state],
  );

  return (
    <SignInFlowContext value={flow}>
      <Stack screenOptions={STACK_OPTIONS}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="code" />
      </Stack>
    </SignInFlowContext>
  );
}

/**
 * Asks Supabase to email a 6-digit code to `email`, creating the account when there is none, and
 * says whether it went. A failure is logged by its class name only, never the address or the
 * server's text.
 */
export async function sendCode(email: string): Promise<boolean> {
  if (supabase === null) {
    return false;
  }
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error === null) {
      return true;
    }
    logWarning('sign_in_send_failed', { kind: error.name });
  } catch (error) {
    logWarning('sign_in_send_failed', { kind: error instanceof Error ? error.name : typeof error });
  }
  return false;
}

type FrameProps = { testID: string; title: string; intro: string; children: ReactNode };

/**
 * A sign-in screen: its title and intro, then its content, in a scroll view below the safe-area
 * insets, so nothing is cut off at the largest text size or behind the keyboard.
 */
export function SignInFrame({ testID, title, intro, children }: FrameProps) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[6] };

  return (
    <View testID={testID} style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, padding]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.body}>{intro}</Text>
        {children}
      </ScrollView>
    </View>
  );
}

type FieldProps = Omit<TextInputProps, 'style' | 'accessibilityLabel'> & {
  /** The visible label, also the field's accessibility label. */
  label: string;
  /** `code` draws the text large and spaced, for the 6 digits. */
  variant?: 'text' | 'code';
};

/** A labelled text field in the design's ink border. */
export function Field({ label, variant = 'text', ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.neutral[600]}
        style={[styles.input, variant === 'code' ? styles.codeInput : null]}
        {...input}
      />
    </View>
  );
}

/**
 * The step's message, from `copy`, or nothing. Screen readers hear it when it appears (a polite
 * live region, and an announcement on iOS).
 */
export function Message({ text }: { text: string | null }) {
  useEffect(() => {
    if (text !== null) {
      announce(text);
    }
  }, [text]);

  return (
    <View testID="sign-in-message" accessibilityLiveRegion="polite">
      {text === null ? null : <Text style={styles.body}>{text}</Text>}
    </View>
  );
}

/** Side padding: the placeholder tabs' left padding (`PlaceholderScreen`). */
const CONTENT_PADDING_X = 18;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: CONTENT_PADDING_X, gap: space[4] },
  title: { ...type.tabTitle, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  field: { gap: space[2] },
  label: { ...type.kicker, color: colors.ink },
  input: {
    fontFamily: fonts.body,
    fontSize: type.body.fontSize,
    color: colors.ink,
    borderWidth: border.strong,
    borderColor: colors.ink,
    minHeight: BUTTON_HEIGHT,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  codeInput: {
    fontFamily: fonts.heading,
    fontSize: type.tabTitle.fontSize,
    letterSpacing: space[2],
  },
});
