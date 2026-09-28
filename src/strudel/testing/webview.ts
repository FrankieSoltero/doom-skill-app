// Test support for the WebView stand-in (src/strudel/__mocks__/webview.tsx): read what the app
// sent to the page, and send the app what a page (or a forged page) would.
import { fireEvent, screen } from '@testing-library/react-native';
import type { WebViewProps } from 'react-native-webview';

import { mountedWebViews, type WebView } from '../__mocks__/webview';

type NavigationRequest = Parameters<NonNullable<WebViewProps['onShouldStartLoadWithRequest']>>[0];

/** The script `pageScript` builds; group 1 is the event's data, a JSON string literal. */
const PAGE_SCRIPT =
  /^window\.dispatchEvent\(new MessageEvent\("message",\{data:(".*")\}\)\);true;$/s;

/** The mounted WebView at `index`, in mount order. */
export function webView(index = 0): WebView {
  const view = mountedWebViews()[index];
  if (view === undefined) {
    throw new Error(`no WebView is mounted at ${String(index)}`);
  }
  return view;
}

function readScript(script: string): unknown {
  const literal = PAGE_SCRIPT.exec(script)?.[1];
  if (literal === undefined) {
    throw new Error('the app injected a script that is not a page message');
  }
  const data: unknown = JSON.parse(literal);
  if (typeof data !== 'string') {
    throw new Error("the page message's data is not a string");
  }
  return JSON.parse(data);
}

/**
 * Every message the app has sent to a WebView, decoded, oldest first: the one mounted at `index`,
 * or a WebView kept from before it unmounted.
 */
export function sentToPage(target: number | WebView = 0): unknown[] {
  const view = typeof target === 'number' ? webView(target) : target;
  return view.injected.map(readScript);
}

/**
 * Fires one of the WebView's events, such as `error` or `renderProcessGone`. The player hides the
 * WebView from accessibility, so the query includes hidden elements.
 */
export function fireWebViewEvent(eventName: string, nativeEvent: object = {}, index = 0): void {
  const host = screen.getAllByTestId('webview-mock', { includeHiddenElements: true })[index];
  if (host === undefined) {
    throw new Error(`no WebView is rendered at ${String(index)}`);
  }
  fireEvent(host, eventName, { nativeEvent });
}

/** The page posts `data` as is: a raw string, or any forged value. */
export function postRaw(data: unknown, index = 0): void {
  fireWebViewEvent('message', { data }, index);
}

/** The page posts `message` as JSON, the way player.js does. */
export function pagePosts(message: object, index = 0): void {
  postRaw(JSON.stringify(message), index);
}

/** A navigation request as the WebView reports it, for `onShouldStartLoadWithRequest`. */
export function navigation(url: string, isTopFrame = true): NavigationRequest {
  return {
    url,
    isTopFrame,
    navigationType: 'other',
    loading: true,
    title: '',
    canGoBack: false,
    canGoForward: false,
    lockIdentifier: 1,
  };
}
