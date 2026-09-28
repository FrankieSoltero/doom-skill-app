const expoConfig = require('eslint-config-expo/flat');
const tseslint = require('typescript-eslint');

// The rule IDs below refer to docs/standards.md.

// SS-1: design tokens have one home, src/theme.
const COLOR_LITERAL_MESSAGE = 'Color literals live in src/theme only. Import a token instead.';
const COLOR_LITERAL_SYNTAX = [
  {
    selector: 'Literal[value=/^(#[0-9a-fA-F]{3,8}|rgba?\\()/]',
    message: COLOR_LITERAL_MESSAGE,
  },
  {
    selector: 'TemplateElement[value.raw=/(#[0-9a-fA-F]{6}\\b|rgba?\\()/]',
    message: COLOR_LITERAL_MESSAGE,
  },
];

// SS-7: card types are inferred from the zod schemas in src/data/schema.ts.
const CARD_TYPE_MESSAGE =
  'Card types are inferred from src/data/schema.ts. Import the type instead.';
const CARD_TYPE_SYNTAX = [
  { selector: 'TSTypeAliasDeclaration[id.name=/Card$/]', message: CARD_TYPE_MESSAGE },
  { selector: 'TSInterfaceDeclaration[id.name=/Card$/]', message: CARD_TYPE_MESSAGE },
];

// SS-8: UI strings live in src/copy. These selectors reject text a person reads, written as a
// string or template literal in the places below. Props that are not text (testID,
// accessibilityRole, style) stay free, and an empty or blank string is not text. This is a syntax
// check: a string held in a variable and then rendered, and `<Text children="..." />`, are not
// detected.
const UI_TEXT_MESSAGE = 'UI strings live in src/copy. Use a copy key instead.';
// Props whose value is text a person reads. Add a prop name here.
const TEXT_PROP_NAMES = '/^(label|title|placeholder|accessibilityLabel|accessibilityHint|alt)$/';
// Keys whose value is text a person reads, inside an object given to a prop, such as Expo
// Router's `options={{ title: ... }}`. Add a key name here.
const TEXT_KEY_NAMES =
  '/^(title|tabBarLabel|headerTitle|tabBarAccessibilityLabel|headerBackTitle|label|placeholder|accessibilityLabel|accessibilityHint)$/';
const ALERT_CALL = 'CallExpression[callee.object.name="Alert"][callee.property.name="alert"]';
// Where literal text is rejected. Each context ends in a combinator (descendant or `>`).
const UI_TEXT_CONTEXTS = [
  // Anywhere inside a text prop's value: `title="Hi"`, `title={ok ? 'Yes' : 'No'}`, `'Hi ' + name`.
  `JSXAttribute[name.name=${TEXT_PROP_NAMES}] `,
  // A text key inside any prop's value, also in an object a function returns.
  `JSXAttribute Property[key.name=${TEXT_KEY_NAMES}] > `,
  // A branch or operand of child text: `{ok ? 'Yes' : 'No'}`, `{ok && 'Yes'}`. Attribute values
  // are not JSX children, so `testID={ok ? 'a' : 'b'}` stays free.
  ':matches(JSXElement, JSXFragment) > JSXExpressionContainer > :matches(ConditionalExpression, LogicalExpression) > ',
  // `Alert.alert(title, message, buttons)`: its string arguments and each button's `text`.
  `${ALERT_CALL} > `,
  `${ALERT_CALL} > ArrayExpression > ObjectExpression > Property[key.name="text"] > `,
];
const UI_TEXT_SYNTAX = UI_TEXT_CONTEXTS.flatMap((context) => [
  { selector: `${context}Literal[value=/\\S/]`, message: UI_TEXT_MESSAGE },
  {
    selector: `${context}TemplateLiteral:has(> TemplateElement[value.raw=/\\S/])`,
    message: UI_TEXT_MESSAGE,
  },
]);

// The folders that render UI. SS-8 applies here only; other code has no UI text.
const UI_FILES = ['app/**', 'src/components/**', 'src/cards/**'];

// `no-restricted-syntax` options from selector groups. A later config object that sets the rule
// replaces its whole list for the files it matches (flat config does not merge rule options), so
// each scope below lists every group that stays on there. To add a group, define its array and
// add it to each scope that keeps it.
function restrictSyntax(...groups) {
  return ['error', ...groups.flat()];
}

// SS-6: card data comes through src/data (the CardSource). Only src/data may import the fixture
// or the fixture source.
const CARD_DATA_IMPORTS = [
  'error',
  {
    patterns: [
      {
        regex: '(^|/)(fixtureSource|__fixtures__/cards\\.fixture\\.json)$',
        message: 'Card data comes through src/data (CardSource). Import from src/data instead.',
      },
    ],
  },
];

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
      // TS-12, SS-10
      'no-console': 'error',
      // SS-1, SS-7 (the UI folders add SS-8 below)
      'no-restricted-syntax': restrictSyntax(COLOR_LITERAL_SYNTAX, CARD_TYPE_SYNTAX),
      // SS-6
      'no-restricted-imports': CARD_DATA_IMPORTS,
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
  // SS-8: UI strings live in src/copy. `react/jsx-no-literals` rejects literal child text
  // (`<Text>Hello</Text>`, `<Text>{'Hello'}</Text>`); its message cannot name SS-8, so this
  // comment and docs/standards.md map it. `ignoreProps` leaves props to the UI-text selectors,
  // which carry the SS-8 message, so testID, accessibilityRole and style stay allowed.
  // Exception #12 in docs/standards.md: both SS-8 checks are off in the __tests__ folders inside
  // these three folders ({app,src/components,src/cards}/**/__tests__/**) because tests assert on
  // literal UI text. Tests there keep the color and card-type selectors of the base.
  {
    files: UI_FILES,
    ignores: ['**/__tests__/**'],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
      'no-restricted-syntax': restrictSyntax(
        COLOR_LITERAL_SYNTAX,
        CARD_TYPE_SYNTAX,
        UI_TEXT_SYNTAX,
      ),
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
  // Exception #4 in docs/standards.md: SS-1 (no-restricted-syntax, the color selectors) off for
  // src/theme/** because the theme is the one place color literals are defined. The other
  // selector groups stay on.
  {
    files: ['src/theme/**'],
    rules: { 'no-restricted-syntax': restrictSyntax(CARD_TYPE_SYNTAX) },
  },
  // Exceptions #9 and #10 in docs/standards.md: SS-6 (no-restricted-imports) and SS-7
  // (no-restricted-syntax, the card-type selectors) off for src/data/** because it is the one
  // place card data is read and card types are declared. The other selector groups stay on.
  {
    files: ['src/data/**'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-syntax': restrictSyntax(COLOR_LITERAL_SYNTAX),
    },
  },
  // Exception #11 in docs/standards.md: TS-12 (no-console) off for src/log.ts because it is the
  // one home of app logging (SS-10). Every other file logs through it.
  {
    files: ['src/log.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    ignores: ['.expo/', 'dist/', 'expo-env.d.ts'],
  },
];
