# Deploying Alexandria to Firebase

The app runs on Firebase as:

- **Firebase Hosting** serves the built frontend (`frontend/dist`) at
  https://alexandria-noahk.web.app
- **Cloud Functions v2** runs the Express backend as a single function named
  `api`. Hosting rewrites `/api/**`, `/verify/**`, and `/health` to it, so the
  frontend talks to the backend same-origin (`frontend/.env.production` sets
  `VITE_PROD_DB` to empty for this reason).
- **Neon** (https://neon.tech) hosts the PostgreSQL database.

Relevant files:

| File | Purpose |
| --- | --- |
| `firebase.json` | Hosting + functions deploy config and rewrites |
| `.firebaserc` | Default project (`alexandria-noahk`) |
| `functions/index.js` | Wraps the compiled Express app in an HTTPS function |
| `functions/package.json` | Backend runtime deps + `@alexandria/shared` via `file:./shared` |
| `functions/.env` | Non-secret runtime config (SERVER_URL, CORS_ORIGIN, DATABASE_SSL) |
| `scripts/prepare-functions.mjs` | Builds shared+backend and copies output into `functions/` (runs automatically on deploy) |

## One-time setup

### 1. Upgrade the Firebase project to the Blaze plan

Cloud Functions require the pay-as-you-go plan (a hobby app normally stays
within the free quota; the function is capped at `maxInstances: 3`):

https://console.firebase.google.com/project/alexandria-noahk/usage/details

### 2. Create the database on Neon

1. Sign up at https://neon.tech (free tier) and create a project
   (PostgreSQL 16+, any region close to `us-central1`).
2. In the Neon **SQL Editor**, paste and run the contents of
   `backend/src/model/schema.sql`, then `backend/src/model/seed-production.sql`
   (languages, dictionaries, and a demo text).
3. Copy the connection string (looks like
   `postgresql://user:password@ep-....neon.tech/neondb?sslmode=require`).

### 3. Set the secrets

From the repository root (each command prompts for the value):

```
firebase functions:secrets:set DATABASE_URL     # the Neon connection string
firebase functions:secrets:set SECRET           # any long random string (JWT signing)
firebase functions:secrets:set DEEPL_API_KEY    # from https://www.deepl.com/pro-api
```

Generate a random SECRET in PowerShell with:

```powershell
-join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
```

Notes:

- All three secrets must exist or the functions deploy fails (they are declared
  in `functions/index.js`).
- The DeepL word-lookup falls back to the free MyMemory API if the DeepL key
  is invalid or over quota.

## Enabling signup emails (optional)

The only email the app sends is the signup verification link, and login works
without verification, so email is disabled by default:
`functions/.env` sets `RESEND_API_KEY=placeholder`, sending fails silently, and
signups still succeed. To enable real emails:

1. Create a Resend account (https://resend.com) and verify a domain you own —
   Resend refuses to send from unverified domains.
2. Change the hardcoded from-address in `backend/src/utils/sendmail.ts`
   (`noreply@signup.tryalexandria.com`) to an address on your verified domain.
3. Remove the `RESEND_API_KEY=placeholder` line from `functions/.env`, add
   `'RESEND_API_KEY'` to the `secrets` array in `functions/index.js`, and set
   the real key with `firebase functions:secrets:set RESEND_API_KEY`.
4. Redeploy: `firebase deploy --only functions`.

## Deploying

```
firebase deploy
```

This builds shared + frontend (hosting predeploy), prepares `functions/`
(functions predeploy), and deploys both. Deploy one side only with
`firebase deploy --only hosting` or `--only functions`.

After changing a secret's value, redeploy the function so it picks up the new
version: `firebase deploy --only functions`.

## Local development

`backend/.env` (gitignored) holds local values (`SECRET`, `DATABASE_URL`,
`DEEPL_API_KEY`). `npm run dev` starts backend + frontend;
`npm run docker:start` brings up a local seeded Postgres on port 5432 matching
the default `DATABASE_URL` in `backend/.env`.
