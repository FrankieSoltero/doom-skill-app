import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { Linking, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { WebView } from 'react-native-webview';
import RNCWebViewModule from 'react-native-webview/lib/NativeRNCWebViewModule';
import RealWebView from 'react-native-webview/lib/WebView';

import { FRAME_GUARD_SCRIPT, STRUDEL_HTML } from '../generated/strudelHtml';
import { sendToPage, StrudelPlayer } from '../StrudelPlayer';
import { fireWebViewEvent, navigation, postRaw, webView } from '../testing/webview';

// The library's own WebView (below) asks this native module to answer each navigation request.
jest.mock('react-native-webview/lib/NativeRNCWebViewModule', () => ({
  __esModule: true,
  default: { shouldStartLoadWithLockIdentifier: jest.fn(), isFileUploadSupported: jest.fn() },
}));

/** React Native's Jest preset already makes `Linking`'s functions `jest.fn`s. */
const linking = jest.mocked(Linking);

// Written as code points: JavaScript source may hold these two characters raw, which hides them.
const LINE_SEPARATOR = String.fromCharCode(0x2028);

function renderPlayer() {
  const ref = createRef<WebView>();
  const onMessage = jest.fn<undefined, [unknown, number]>();
  const onUnavailable = jest.fn<undefined, [string, number]>();
  const player = (page: number) => (
    <StrudelPlayer
      page={page}
      webViewRef={ref}
      onMessage={onMessage}
      onUnavailable={onUnavailable}
    />
  );
  const { unmount, rerender } = render(player(0));
  const loadPage = (page: number) => {
    rerender(player(page));
  };
  return { ref, onMessage, onUnavailable, unmount, loadPage };
}

/** Every prop the player sets on the WebView, with its exact value. */
const WEBVIEW_PROPS = {
  // Every URL goes to onShouldStartLoadWithRequest; see StrudelPlayer.tsx for why not about:blank.
  originWhitelist: ['*'],
  source: { html: STRUDEL_HTML },
  javaScriptEnabled: true,
  allowsInlineMediaPlayback: true,
  mediaPlaybackRequiresUserAction: false,
  setSupportMultipleWindows: false,
  allowFileAccess: false,
  allowFileAccessFromFileURLs: false,
  allowUniversalAccessFromFileURLs: false,
  sharedCookiesEnabled: false,
  thirdPartyCookiesEnabled: false,
  incognito: true,
  cacheEnabled: false,
  domStorageEnabled: false,
  allowsLinkPreview: false,
  dataDetectorTypes: 'none',
  webviewDebuggingEnabled: __DEV__,
  geolocationEnabled: false,
  allowsBackForwardNavigationGestures: false,
  mediaCapturePermissionGrantType: 'deny',
  // react-native-webview 13.16.1 has no prop that turns its native dialogs off, and CSP does not
  // govern WebRTC: both are replaced before any content runs, in every frame (page/dialogs.js and
  // page/webrtc.js, built into the generated module; scripts/__tests__/build-strudel.test.mjs runs it).
  injectedJavaScriptBeforeContentLoaded: FRAME_GUARD_SCRIPT,
  injectedJavaScriptBeforeContentLoadedForMainFrameOnly: false,
};

const HANDLERS = [
  'onShouldStartLoadWithRequest',
  'onMessage',
  'onContentProcessDidTerminate',
  'onRenderProcessGone',
  'onError',
  'onHttpError',
  'renderError',
];

describe('StrudelPlayer: the WebView', () => {
  it('sets exactly the listed props, each to its value', () => {
    renderPlayer();
    const { props } = webView();

    expect(props).toMatchObject(WEBVIEW_PROPS);
    expect(Object.keys(props).sort()).toStrictEqual(
      [...Object.keys(WEBVIEW_PROPS), ...HANDLERS].sort(),
    );
    for (const handler of HANDLERS) {
      expect(typeof Reflect.get(props, handler)).toBe('function');
    }
  });

  it('loads the page from the string with no base URL', () => {
    renderPlayer();
    expect(webView().props.source).toStrictEqual({ html: STRUDEL_HTML });
  });

  it('shows nothing when the page fails to load, not the library error text', () => {
    renderPlayer();
    const { renderError } = webView().props;
    render(<View testID="error-box">{renderError?.('WebKitErrorDomain', 1, 'failed')}</View>);
    expect(screen.getByTestId('error-box').children).toHaveLength(0);
  });

  it('is 0 by 0, ignores touches and is hidden from accessibility on both platforms', () => {
    renderPlayer();
    const box = screen.getByTestId('strudel-player', { includeHiddenElements: true });

    const { style } = box.props as { style?: StyleProp<ViewStyle> };
    expect(StyleSheet.flatten(style)).toStrictEqual({
      position: 'absolute',
      width: 0,
      height: 0,
      overflow: 'hidden',
    });
    const props: Record<string, unknown> = { ...(box.props as Record<string, unknown>) };
    expect({
      pointerEvents: props.pointerEvents,
      accessibilityElementsHidden: props.accessibilityElementsHidden,
      importantForAccessibility: props.importantForAccessibility,
    }).toStrictEqual({
      pointerEvents: 'none',
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(screen.queryByTestId('webview-mock', { includeHiddenElements: false })).toBeNull();
  });

  it('attaches the WebView to the ref it is given', () => {
    const { ref } = renderPlayer();
    expect(Object.is(ref.current, webView())).toBe(true);
  });

  it('keeps its WebView across renders, and replaces it with a fresh one for a new page', () => {
    const { ref, loadPage } = renderPlayer();
    const first = webView();
    loadPage(0);
    expect(webView() === first).toBe(true);
    loadPage(1);
    expect(webView() === first).toBe(false);
    expect(Object.is(ref.current, webView())).toBe(true);
  });
});

const HOSTILE_URLS = [
  'https://example.com',
  'http://example.com',
  'tel:1',
  'sms:1',
  'mailto:a@example.com',
  'doomskill://x',
  'file:///etc/passwd',
  'javascript:alert(1)',
  'data:text/html,x',
  'blob:null/1',
  'about:srcdoc',
  'about:blank#x',
  'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json',
];

describe('StrudelPlayer: navigation', () => {
  const allow = (url: string, isTopFrame?: boolean): boolean | undefined =>
    webView().props.onShouldStartLoadWithRequest?.(navigation(url, isTopFrame));

  beforeEach(() => {
    linking.openURL.mockClear();
    linking.canOpenURL.mockClear();
  });

  afterEach(() => {
    expect(linking.openURL.mock.calls).toStrictEqual([]);
    expect(linking.canOpenURL.mock.calls).toStrictEqual([]);
  });

  it('allows the first load of the page, a top-frame about:blank, and refuses a second one', () => {
    renderPlayer();
    expect(allow('about:blank')).toBe(true);
    expect(allow('about:blank')).toBe(false);
  });

  it('refuses every request on Android, where the first load of the page never reaches it', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    try {
      renderPlayer();
      expect(allow('about:blank')).toBe(false);
      expect(allow('https://example.com')).toBe(false);
    } finally {
      jest.restoreAllMocks();
    }
    expect(Platform.OS).toBe('ios');
  });

  it('allows the first load again on a new page, and only that', () => {
    const { loadPage } = renderPlayer();
    expect(allow('about:blank')).toBe(true);
    loadPage(1);
    expect(allow('about:blank')).toBe(true);
    expect(allow('about:blank')).toBe(false);
  });

  it('refuses a first about:blank request that is not for the top frame, and all after it', () => {
    renderPlayer();
    expect(allow('about:blank', false)).toBe(false);
    expect(allow('about:blank')).toBe(false);
  });

  it.each(HOSTILE_URLS)('refuses %s, as the first request and after the page has loaded', (url) => {
    const first = renderPlayer();
    expect(allow(url)).toBe(false);
    first.unmount();

    renderPlayer();
    expect(allow('about:blank')).toBe(true);
    expect(allow(url)).toBe(false);
    expect(allow(url, false)).toBe(false);
  });
});

/** The native view react-native-webview renders, by its registered name. */
const NATIVE_WEBVIEW: string = 'RNCWebView';

describe('StrudelPlayer: navigation through the real react-native-webview', () => {
  const nativeModule = jest.mocked(RNCWebViewModule);

  /** Renders the library's own WebView with the props the player gives it. */
  function renderRealWebView(overrides: { originWhitelist?: string[] } = {}) {
    renderPlayer();
    const props = { ...webView().props, ...overrides };
    render(<RealWebView {...props} />);
    const [native] = screen.UNSAFE_root.findAll((node) => node.type === NATIVE_WEBVIEW);
    if (native === undefined) {
      throw new Error('the library rendered no RNCWebView');
    }
    return (url: string, isTopFrame = true): void => {
      fireEvent(native, 'shouldStartLoadWithRequest', {
        nativeEvent: { ...navigation(url, isTopFrame), lockIdentifier: 7 },
      });
    };
  }

  beforeEach(() => {
    nativeModule.shouldStartLoadWithLockIdentifier.mockClear();
    linking.openURL.mockClear();
    linking.canOpenURL.mockClear();
  });

  it('reaches the gate for every URL, answers no to the native side, and opens nothing', () => {
    const request = renderRealWebView();
    request('about:blank');
    for (const url of HOSTILE_URLS) {
      request(url);
    }
    expect(nativeModule.shouldStartLoadWithLockIdentifier.mock.calls).toStrictEqual([
      [true, 7],
      ...HOSTILE_URLS.map(() => [false, 7]),
    ]);
    expect(linking.canOpenURL.mock.calls).toStrictEqual([]);
    expect(linking.openURL.mock.calls).toStrictEqual([]);
  });

  it("would hand the URL to Linking with the brief's ['about:blank'] whitelist", () => {
    const request = renderRealWebView({ originWhitelist: ['about:blank'] });
    request('about:blank');
    request('tel:1');
    expect(nativeModule.shouldStartLoadWithLockIdentifier.mock.calls).toStrictEqual([
      [true, 7],
      [false, 7],
    ]);
    expect(linking.canOpenURL.mock.calls).toStrictEqual([['tel:1']]);
  });
});

describe('StrudelPlayer: events', () => {
  it('passes the raw data of each page message on, as is', () => {
    const { onMessage } = renderPlayer();
    postRaw('{"type":"ready"}');
    postRaw('not json');
    expect(onMessage.mock.calls).toStrictEqual([
      ['{"type":"ready"}', 0],
      ['not json', 0],
    ]);
  });

  it.each([
    { event: 'contentProcessDidTerminate', reason: 'process_gone' },
    { event: 'renderProcessGone', reason: 'process_gone' },
    { event: 'error', reason: 'load_error' },
    { event: 'httpError', reason: 'load_error' },
  ])('reports $reason when the WebView fires $event', ({ event, reason }) => {
    const { onUnavailable, onMessage } = renderPlayer();
    fireWebViewEvent(event, { didCrash: true, code: 1, statusCode: 500, description: 'x' });
    expect(onUnavailable.mock.calls).toStrictEqual([[reason, 0]]);
    expect(onMessage).not.toHaveBeenCalled();
  });
});

describe('sendToPage', () => {
  it('injects the page script for a load with hostile code, exactly', () => {
    const { ref } = renderPlayer();
    const code = `a"b\\c\nd</script>\`x\`${LINE_SEPARATOR}e`;

    sendToPage(ref.current, { type: 'load', code });

    expect(webView().injected).toStrictEqual([
      'window.dispatchEvent(new MessageEvent("message",{data:' +
        '"{\\"type\\":\\"load\\",\\"code\\":\\"a\\\\\\"b\\\\\\\\c\\\\nd</script>`x`\\u2028e\\"}"' +
        '}));true;',
    ]);
    expect(webView().posted).toStrictEqual([]);
  });

  it.each([{ type: 'play' as const }, { type: 'stop' as const }])('injects $type', (message) => {
    const { ref } = renderPlayer();
    sendToPage(ref.current, message);
    expect(webView().injected).toStrictEqual([
      `window.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify(message))}}));true;`,
    ]);
  });

  it('does nothing when no WebView is mounted', () => {
    expect(() => {
      sendToPage(null, { type: 'play' });
    }).not.toThrow();
  });
});
