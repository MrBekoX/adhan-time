module.exports = {
  root: true,
  extends: ['expo', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'import'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': 'warn',
    // import/order requires a resolver that conflicts with typescript-eslint v7.
    // TS compiler already validates import paths.
    'import/order': 'off',
    'import/no-unresolved': 'off',
    'import/namespace': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'react-hooks/exhaustive-deps': 'error',
    // I4+I5: locale-aware lowercase. .toLowerCase() applies the runtime's
    // default rules (often EN), which mangles Turkish-İ in TR strings.
    // Also forbid calling toLocaleLowerCase('tr') with a hardcoded literal:
    // it ships TR rules to non-TR locales and corrupts other Latin scripts.
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.property.name='toLowerCase']",
        message: "Use lowercaseInLocale(value, i18n.language) from utils/textCase — .toLowerCase() ignores locale rules.",
      },
      {
        selector:
          "CallExpression[callee.property.name='toLocaleLowerCase'] > Literal[value='tr']",
        message:
          "Pass i18n.language (or another locale variable) to toLocaleLowerCase, not a hardcoded 'tr'.",
      },
      // I9: physical-edge margin/padding flips wrong under RTL. Use start/end.
      // (The qibla compass is exempt because it locks to LTR for math; even
      // start/end is forbidden there — see rules/11-qibla.md.)
      {
        selector:
          "Property[key.name=/^(marginLeft|marginRight|paddingLeft|paddingRight)$/]",
        message:
          'Use marginStart/marginEnd/paddingStart/paddingEnd so layout flips correctly under RTL locales.',
      },
    ],
  },
  overrides: [
    {
      // V8: scheduler must derive sound files from the SOUNDS table — never
      // hard-code 'adhanShort' or 'adhan_short.wav' inline.
      files: ['services/notificationScheduler.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "Literal[value='adhanShort']",
            message: 'Use SOUNDS lookup (constants/notifications) instead of literal sound key.',
          },
          {
            selector: "Literal[value='adhan_short.wav']",
            message: 'Use SOUNDS lookup (constants/notifications) instead of literal sound filename.',
          },
        ],
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', 'supabase/functions/'],
};
