const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

// SS-1: design tokens have one home, src/theme. The rule IDs below refer to docs/standards.md.
const COLOR_LITERAL_MESSAGE = 'Color literals live in src/theme only. Import a token instead.';

module.exports = [
  ...expoConfig,
  // Type-aware rules need type information, which only the TypeScript sources have.
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      // typescript-eslint infers tsconfigRootDir as this file's directory.
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
  // Project rules for every linted JS and TS file.
  {
    rules: {
      // TS-4
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      // TS-5
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      // TS-6
      complexity: ['error', 10],
      // TS-7
      'max-depth': ['error', 3],
      // TS-8
      'max-params': ['error', 4],
      // TS-11
      'import/no-default-export': 'error',
      // TS-12
      'no-console': 'error',
      // SS-1
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?\\()/]',
          message: COLOR_LITERAL_MESSAGE,
        },
        {
          selector: 'TemplateElement[value.raw=/(#[0-9a-fA-F]{6}\\b|rgba?\\()/]',
          message: COLOR_LITERAL_MESSAGE,
        },
      ],
    },
  },
  // Project rules that need the TypeScript parser.
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TS-9
      '@typescript-eslint/no-explicit-any': 'error',
      // TS-10
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  // Exception #3 in docs/standards.md: TS-11 (import/no-default-export) off for app/** because
  // Expo Router requires every route file to default-export its screen. Tests under __tests__ are
  // not routes and stay covered.
  {
    files: ['app/**'],
    ignores: ['app/**/__tests__/**'],
    rules: { 'import/no-default-export': 'off' },
  },
  // Exception #2 in docs/standards.md: TS-11 (import/no-default-export) off for *.config.js
  // because ESLint and Jest require their config files to default-export.
  {
    files: ['*.config.js'],
    rules: { 'import/no-default-export': 'off' },
  },
  // Exception #4 in docs/standards.md: SS-1 (no-restricted-syntax, the color rule) off for
  // src/theme/** because the theme is the one place color literals are defined.
  {
    files: ['src/theme/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    ignores: ['.expo/', 'dist/', 'expo-env.d.ts'],
  },
];
