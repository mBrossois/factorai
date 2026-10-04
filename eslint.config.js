import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'server/.workspaces/**', '.kilo/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The 3D layer and the first-person controller are an imperative render
    // loop driven by @react-three/fiber: three.js objects, shader uniforms and
    // scene-graph refs are mutated inside `useFrame` by design, and React
    // components read those refs to position the camera. The React Compiler
    // rules below assume a pure, declarative render and cannot model that, so
    // they are scoped off here rather than fought at every call site.
    // Per-instance randomness is generated from a seeded PRNG (src/three/random.ts)
    // instead of Math.random, so this exemption does not hide nondeterminism.
    files: ['src/three/**/*.{ts,tsx}', 'src/hooks/useFirstPerson.ts'],
    rules: {
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
    },
  },
);
