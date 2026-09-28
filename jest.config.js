/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // lucide-react-native's `react-native` export condition points at an ESM .mjs build that
    // jest-expo does not transform. Node's require.resolve here takes the `require` condition, so
    // Jest loads the package's CommonJS build. Metro is unaffected.
    '^lucide-react-native$': require.resolve('lucide-react-native'),
  },
  // Enforced when coverage is collected: the `test` script passes --coverage. Coverage is not
  // on by default here, because Jest fails a run that loads no src/data file when a path
  // threshold is set ("Coverage data for ./src/data/ was not found"), which would break
  // running a single unrelated test file.
  coverageThreshold: {
    './src/data/': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './src/feed/': { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};
