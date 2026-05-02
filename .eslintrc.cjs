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
  },
  ignorePatterns: ['node_modules/', 'dist/', 'supabase/functions/'],
};
