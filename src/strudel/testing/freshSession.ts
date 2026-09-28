// Test support: runs a Strudel player in a fresh copy of every module, so session-wide state (the
// once-per-session dropped-message log) starts unset whatever the test file ran before. Not app
// code. The calling test file must mock `../../log` (`jest.mock('../../log', ...)`).

/**
 * Renders `useStrudel().player` from fresh modules, has the page post each of `messages` as raw
 * `data`, and returns every call the fresh session made to `logWarning`.
 *
 * It loads `@testing-library/react-native/pure`: the main entry registers `afterEach` and
 * `beforeAll` when it loads, which Jest refuses inside a test. So it cleans up by itself.
 */
export function logsOfFreshSession(messages: readonly unknown[]): unknown[][] {
  const calls: unknown[][] = [];
  jest.isolateModules(() => {
    const rntl = jest.requireActual<typeof import('@testing-library/react-native/pure')>(
      '@testing-library/react-native/pure',
    );
    const react = jest.requireActual<typeof import('react')>('react');
    const fresh = jest.requireActual<typeof import('../useStrudel')>('../useStrudel');
    const logWarning = jest.mocked(
      jest.requireMock<typeof import('../../log')>('../../log').logWarning,
    );
    logWarning.mockClear();
    function FreshScreen() {
      return fresh.useStrudel().player;
    }
    rntl.render(react.createElement(FreshScreen));
    const host = rntl.screen.getByTestId('webview-mock', { includeHiddenElements: true });
    for (const data of messages) {
      rntl.fireEvent(host, 'message', { nativeEvent: { data } });
    }
    calls.push(...logWarning.mock.calls);
    rntl.cleanup();
  });
  return calls;
}
