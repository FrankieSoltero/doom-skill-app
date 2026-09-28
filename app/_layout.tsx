import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed';
import { Barlow_400Regular, Barlow_500Medium, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ErrorScreen } from '../src/components/ErrorScreen';
import { copy } from '../src/copy';
import { logWarning } from '../src/log';
import { colors } from '../src/theme';

/**
 * A splash-screen call that fails (no native splash screen, or it is already hidden) leaves
 * nothing to do: the app renders either way. Handling the rejection keeps it from surfacing as an
 * unhandled rejection.
 */
function ignoreSplashFailure(): void {
  // Nothing to recover.
}

/**
 * The tab shell draws its own screens, so the stack shows no header. Its content ground is paper,
 * so no white frame shows between the splash screen and the first screen.
 */
const STACK_OPTIONS = { headerShown: false, contentStyle: { backgroundColor: colors.paper } };

// Once, at module scope, so it runs before the native splash screen can hide on its own.
SplashScreen.preventAutoHideAsync().catch(ignoreSplashFailure);

/**
 * The root layout. It keeps the splash screen up and renders nothing until the Barlow faces have
 * loaded or failed. On failure the routes render with system fonts and one warning is logged.
 */
export default function RootLayout() {
  // Keys are the face names the theme's `fonts` object uses.
  const [fontsLoaded, fontError] = useFonts({
    BarlowCondensed_600SemiBold,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_700Bold,
  });
  const fontsSettled = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (fontsSettled) {
      SplashScreen.hideAsync().catch(ignoreSplashFailure);
    }
  }, [fontsSettled]);

  useEffect(() => {
    if (fontError !== null) {
      logWarning('fonts_failed');
    }
  }, [fontError]);

  if (!fontsSettled) {
    return null;
  }

  // The gesture root sits as close to the app's root as possible, as Gesture Handler asks, so the
  // feed pager's pan works on every screen.
  return (
    <GestureHandlerRootView style={styles.root}>
      <RootBoundary>
        <Stack screenOptions={STACK_OPTIONS} />
      </RootBoundary>
      <StatusBar style="dark" />
    </GestureHandlerRootView>
  );
}

/**
 * The app's last error boundary: an error thrown while rendering any screen that no inner boundary
 * caught (the header, the pager, the tab bar, a fallback) shows a full-screen message with Retry
 * instead of reaching the React root. Retry changes the boundary's key, so it remounts the routes
 * with fresh state. The fallback reads only `copy` and draws `ErrorScreen`: no store, no router.
 */
function RootBoundary({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const fallback = (
    <ErrorScreen
      message={copy.appFailed}
      actionLabel={copy.retry}
      onAction={() => {
        setAttempt((n) => n + 1);
      }}
    />
  );

  return (
    <ErrorBoundary key={attempt} name="root" fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
