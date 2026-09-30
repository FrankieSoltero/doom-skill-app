// The hidden WebView that hosts the Strudel page (src/strudel/page/, built into the generated
// module). The page evaluates code the learner types, so this view gives it as little as it can:
// no navigation, no windows, no files, no cookies or storage, no link previews, no media capture,
// and, in every frame, no JavaScript dialogs and no WebRTC (FRAME_GUARD_SCRIPT, built from
// page/dialogs.js and page/webrtc.js by scripts/build-strudel.mjs).
// It is 0 by 0, ignores touches, is hidden from assistive technology, and renders no text.
import { useState, type ReactElement, type Ref } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

import { pageScript, type ToPage } from './bridge';
import { FRAME_GUARD_SCRIPT, STRUDEL_HTML } from './generated/strudelHtml';

type NavigationRequest = Parameters<NonNullable<WebViewProps['onShouldStartLoadWithRequest']>>[0];

/** Why the player stopped being usable. */
export type UnavailableReason = 'timeout' | 'process_gone' | 'load_error';

/**
 * Loaded from the string with no `baseUrl`, so the page's URL is `about:blank` (what
 * react-native-webview 13.16.1 passes WKWebView and Android's WebView when `baseUrl` is absent).
 * One object for the app's lifetime, so a re-render never reloads the page.
 */
const SOURCE = { html: STRUDEL_HTML };

/** The URL the page loads as. */
const PAGE_URL = 'about:blank';

/**
 * Every URL is passed to `onShouldStartLoadWithRequest`, which refuses all but the page's first
 * load. Not `['about:blank']`: react-native-webview 13.16.1 hands a URL that fails the whitelist
 * to `Linking.openURL` (`createOnShouldStartLoadWithRequest` in its `WebViewShared`), so the page
 * could open any link, `tel:` or app URL outside the app.
 */
const ORIGIN_WHITELIST = ['*'];

/**
 * The one gate for navigation. It allows exactly one request: the first it sees, and only when
 * that is a top-frame load of the page's own URL, which is the WebView loading the HTML string.
 * The first request decides: after it, every request is refused, a second top-frame
 * `about:blank` load included, so code in the page cannot navigate, reload into something else,
 * open a link or leave. A subframe request is refused whenever it comes (the page's CSP blocks
 * frames anyway), and if iOS asked twice about the same load, the second answer would be no.
 * It never opens anything: nothing here calls `Linking`.
 *
 * On Android the first load of an HTML string does not reach this check (a WebView does not ask
 * about `loadDataWithBaseURL`), so every request it sees there comes from the page: on Android it
 * refuses all of them.
 */
function createNavigationGuard(): (request: NavigationRequest) => boolean {
  let decided = false;
  return (request) => {
    const allowed =
      Platform.OS !== 'android' && !decided && request.isTopFrame && request.url === PAGE_URL;
    decided = true;
    return allowed;
  };
}

/** In place of the library's error view, which shows the error text: nothing. */
function renderNothing(): ReactElement {
  return <></>;
}

interface PageProps {
  /** Which load of the page this is. A new number replaces the WebView with a fresh page. */
  page: number;
  /** Receives the WebView; `sendToPage` sends through it. */
  webViewRef: Ref<WebView>;
  /**
   * Each raw message the page posts, as is, with the `page` it came from. It is untrusted: read
   * it only through `decode`.
   */
  onMessage: (raw: unknown, page: number) => void;
  /** The page's process ended, or the page failed to load; with the `page` it happened to. */
  onUnavailable: (reason: UnavailableReason, page: number) => void;
}

/**
 * The hidden WebView. Render it once; `useStrudel` does, through its `player`. The WebView sits
 * in a box that is 0 by 0, ignores touches and is hidden from accessibility on both platforms.
 */
export function StrudelPlayer(props: PageProps): ReactElement {
  return (
    <View
      testID="strudel-player"
      style={styles.hidden}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <StrudelPage key={props.page} {...props} />
    </View>
  );
}

/** One load of the page: its WebView and its navigation gate, both new for each load. */
function StrudelPage({ page, webViewRef, onMessage, onUnavailable }: PageProps): ReactElement {
  const [allowNavigation] = useState(createNavigationGuard);
  const processGone = () => {
    onUnavailable('process_gone', page);
  };
  const loadError = () => {
    onUnavailable('load_error', page);
  };

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={ORIGIN_WHITELIST}
      source={SOURCE}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      onShouldStartLoadWithRequest={allowNavigation}
      onMessage={(event) => {
        onMessage(event.nativeEvent.data, page);
      }}
      onContentProcessDidTerminate={processGone}
      onRenderProcessGone={processGone}
      onError={loadError}
      onHttpError={loadError}
      renderError={renderNothing}
      setSupportMultipleWindows={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      incognito
      cacheEnabled={false}
      domStorageEnabled={false}
      allowsLinkPreview={false}
      dataDetectorTypes="none"
      webviewDebuggingEnabled={__DEV__}
      geolocationEnabled={false}
      allowsBackForwardNavigationGestures={false}
      mediaCapturePermissionGrantType="deny"
      injectedJavaScriptBeforeContentLoaded={FRAME_GUARD_SCRIPT}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
    />
  );
}

/** Sends one message to the page. Does nothing while no WebView is mounted. */
export function sendToPage(webView: WebView | null, message: ToPage): void {
  webView?.injectJavaScript(pageScript(message));
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
});
