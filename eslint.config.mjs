import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-web/**',
      '**/lib/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      'app/android/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/*.config.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    // Live Firestore subscriptions must go through useLiveQuery/useLiveDoc,
    // which reset state when inputs change and on errors — hand-rolled
    // onSnapshot state showed one week's entries under another on slow
    // connections (docs/POSTMORTEM-2026-07-16-stale-week.md). Exemptions:
    // liveQuery.ts is the choke point; session.ts couples its doc listener to
    // the auth lifecycle and does its own reset.
    files: ['app/src/**/*.{ts,tsx}'],
    ignores: ['app/src/liveQuery.ts', 'app/src/session.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/firestore',
              importNames: ['onSnapshot'],
              message:
                'Subscribe via useLiveQuery/useLiveDoc (src/liveQuery.ts) — they reset on input change and clear on error. See docs/POSTMORTEM-2026-07-16-stale-week.md.',
            },
          ],
        },
      ],
    },
  },
);
