import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Constitution I: `any` is forbidden in application code.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // Must stay last: turns off style rules that Prettier owns.
  prettier,
);
