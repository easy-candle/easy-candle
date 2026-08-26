# Local Google Sign in

Work on branch `feat/account-entitlements` (Electron) and `feat/google-auth` (API / Pro).

## Run

Sibling folders: `easy-candle-api`, `easy-candle-pro`, `easy-candle-electron`.

1. Create a local Postgres database and put `DATABASE_URL` in `easy-candle-api/.env`
2. Create a Google OAuth **Web application** client. Redirect URI: `http://127.0.0.1:8787/auth/google/callback`
3. API: `cd easy-candle-api && yarn install && yarn prisma:migrate && yarn dev` (port 8787)
4. App: `cd easy-candle-electron && yarn dev`
5. Optional web: `yarn dev:web` (same Account UI; token in sessionStorage)

Override API origin: `EASY_CANDLE_API_URL=http://127.0.0.1:8787`.

## Check

- Signed out: title bar **Sign in** opens the Google Sign in dialog
- Continue with Google: avatar (photo when Google provides one), name, and Sign out
- Sign out: title bar returns to **Sign in**
