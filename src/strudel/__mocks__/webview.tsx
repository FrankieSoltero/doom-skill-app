// Stands in for react-native-webview in tests: `apps/mobile/jest.config.js` maps the package name
// to this file. The real WebView is a native view that Jest cannot render, and the library ships
// no Jest setup of its own.
//
// Each mounted WebView keeps the props it was given and records every script injected and every
// message posted through its ref. It renders one plain view with the test ID `webview-mock`, so a
// test can fire the WebView's events (`message`, `error`, `renderProcessGone`, ...) with RNTL's
// `fireEvent`, which finds the handler on this component's props.
import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import type { WebViewProps } from 'react-native-webview';

const mounted: WebView[] = [];

export class WebView extends Component<WebViewProps> {
  /** Every script passed to `injectJavaScript`, oldest first. */
  readonly injected: string[] = [];

  /** Every message passed to `postMessage`, oldest first. */
  readonly posted: string[] = [];

  override componentDidMount(): void {
    mounted.push(this);
  }

  override componentWillUnmount(): void {
    mounted.splice(mounted.indexOf(this), 1);
  }

  injectJavaScript = (script: string): void => {
    this.injected.push(script);
  };

  postMessage = (message: string): void => {
    this.posted.push(message);
  };

  override render(): ReactNode {
    return <View testID="webview-mock" />;
  }
}

/** The WebViews mounted now, in the order they mounted. */
export function mountedWebViews(): readonly WebView[] {
  return mounted;
}
