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
    // Every color must come from a semantic theme token (src/theme), so a
    // hardcoded hex/rgb/hsl literal is a bug — it bypasses the Option-1 palette
    // and could not be re-themed in one place (the whole point of the token
    // layer). Exemptions: src/theme/** is the palette itself; printStatement.web.ts
    // is a PRINT stylesheet (paper is always light — literal brand hexes by
    // design, kept in sync with the palette by hand).
    // app/** not app/src/**: App.tsx lives at app root and hardcoded the header
    // tint before this rule existed.
    files: ['app/**/*.{ts,tsx}'],
    ignores: ['app/src/theme/**', 'app/src/printStatement.web.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            'Hardcoded color. Use a semantic token from src/theme (e.g. t.bg.surface, t.text.muted).',
        },
        {
          selector: "Literal[value=/^(?:rgb|rgba|hsl|hsla)\\(/]",
          message: 'Hardcoded color. Use a semantic token from src/theme.',
        },
      ],
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
