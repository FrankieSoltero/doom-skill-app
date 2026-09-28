import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed';
import { Barlow_400Regular, Barlow_500Medium, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { logWarning } from '../src/log';

/**
 * A splash-screen call that fails (no native splash screen, or it is already hidden) leaves
 * nothing to do: the app renders either way. Handling the rejection keeps it from surfacing as an
 * unhandled rejection.
 */
function ignoreSplashFailure(): void {
  // Nothing to recover.
}

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

  return (
    <>
      <Stack />
      <StatusBar style="dark" />
    </>
  );
}
