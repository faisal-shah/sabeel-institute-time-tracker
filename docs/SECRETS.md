# Secrets & config (names only — never commit values)

Client Firebase config is **not** secret and is committed (`app/src/firebase-config.ts`).
Everything below is either a server secret or gitignored local config.

## Cloud Functions secrets (Secret Manager)
Set with `firebase functions:secrets:set <NAME>`; bind in code via `defineSecret`.

| Name | Used by | Where to find the value |
|---|---|---|
| `SENTRY_DSN` | functions error capture (`functions/src/sentry.ts`) | Sentry → Project → Client Keys (DSN) |

## Cloud Functions env vars (`functions/.env`, gitignored)
Plain env vars (NOT `defineString` params — those hang the emulator on a stdin prompt).
See `functions/.env.example`.

| Name | Used by | Value |
|---|---|---|
| `PROBE_TOKEN` | `probeQueries` (post-deploy index check) | Any long random string |

## App client env (`app/.env.local`, gitignored)
| Name | Used by | Value |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | app Sentry seam (`app/src/sentry*.ts`) | Sentry DSN (deferred to launch) |
| `EXPO_PUBLIC_USE_EMULATORS` | dev only — point the app at local emulators | `1` |

## Non-secret client config in the repo
- `app/src/firebase-config.ts` — Firebase web app config (public).
- `packages/shared/src/constants.ts` → `WEB_CLIENT_ID` — the **Web** OAuth client id
  (public; needed by native Google Sign-In). Not the Android client id.
- `app/google-services.json` — committed placeholder until the real Firebase Android
  app exists; replace per `TODO.md`.
