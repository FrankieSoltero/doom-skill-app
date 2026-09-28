/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Enforced when coverage is collected: the `test` script passes --coverage. Coverage is not
  // on by default here, because Jest fails a run that loads no src/data file when a path
  // threshold is set ("Coverage data for ./src/data/ was not found"), which would break
  // running a single unrelated test file.
  coverageThreshold: {
    './src/data/': { branches: 90, functions: 90, lines: 90, statements: 90 },
    './src/feed/': { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
};
