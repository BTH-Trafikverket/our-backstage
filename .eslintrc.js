module.exports = {
  root: true,
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'prefer-template': 'error',
    'no-shadow': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^',
        varsIgnorePattern: '^',
        ignoreRestSiblings: true,
      },
    ],
  },
  overrides: [
    {
      files: ['.ts', '.tsx'],
      rules: {},
    },
    {
      files: ['/*.test.ts', '/*.test.tsx', '**/setupTests.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
