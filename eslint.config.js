const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

// Base presets only. Task 7 appends the project rules to this array.
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
  {
    ignores: ['.expo/', 'dist/', 'expo-env.d.ts'],
  },
];
