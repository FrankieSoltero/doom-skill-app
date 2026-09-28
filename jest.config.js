/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // lucide-react-native's `react-native` export condition points at an ESM .mjs build that
    // jest-expo does not transform. Node's require.resolve here takes the `require` condition, so
    // Jest loads the package's CommonJS build. Metro is unaffected.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
    // src/strudel/generated/strudelHtml is written by the build script and is git-ignored, so it
    // does not exist on a fresh clone or in CI. Any import that resolves to it (relative paths
    // such as `./generated/strudelHtml` or `../strudel/generated/strudelHtml`) gets the stub
    // instead, so tests need no build.
    '(^|/)generated/strudelHtml$': '<rootDir>/src/strudel/__mocks__/strudelHtml.ts',
    // react-native-webview is a native view Jest cannot render, and the library ships no Jest
    // setup. The package name (not its subpaths) maps to a stand-in that records its props and
    // the scripts injected through its ref; see the file.
    '^react-native-webview$': '<rootDir>/src/strudel/__mocks__/webview.tsx',
  },
  // react-native-gesture-handler's documented Jest setup: it mocks the native module and the
  // native buttons (docs.swmansion.com/react-native-gesture-handler/docs/guides/testing).
  setupFiles: [require.resolve('react-native-gesture-handler/jestSetup.js')],
  // The worklets mock and Reanimated's test setup; see the file.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Enforced when coverage is collected: the `test` script passes --coverage. Coverage is not
  // on by default here, because Jest fails a run that loads no src/data file when a path
  // threshold is set ("Coverage data for ./src/data/ was not found"), which would break
  // running a single unrelated test file.
  coverageThreshold: {
    './src/data/': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './src/feed/': { branches: 90, functions: 90, lines: 90, statements: 90 },
    // The trust boundary between the app and the WebView page (rule SS-9's one home).
    './src/strudel/bridge.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};
