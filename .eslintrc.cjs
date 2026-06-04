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
    // .toLowerCase() applies the runtime's default rules (often EN) and
    // mangles Turkish-İ in TR strings. Also forbid hardcoded
    // toLocaleLowerCase('tr') — it ships TR rules to non-TR locales and
    // corrupts other Latin scripts.
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
      // Physical-edge margin/padding flips wrong under RTL — use start/end.
      // (The qibla compass is exempt because it locks to LTR for math; even
      // start/end is forbidden there — see .claude/rules/11-qibla.md.)
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
      // Scheduler must derive the sound from constants/notifications
      // (soundForPrayer / NOTIFICATION_SOUND_FILE) — never hard-code the
      // 'notification.wav' filename inline.
      files: ['services/notificationScheduler.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: "Literal[value='notification.wav']",
            message:
              'Use NOTIFICATION_SOUND_FILE / soundForPrayer (constants/notifications) instead of the literal sound filename.',
          },
        ],
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', 'supabase/functions/'],
};
