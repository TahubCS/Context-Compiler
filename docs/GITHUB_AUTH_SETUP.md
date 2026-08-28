# GitHub authentication and repository access

Context Compiler deliberately uses two independent flows:

1. **Supabase GitHub OAuth** signs a person into Context Compiler.
2. **The Context Compiler GitHub App** grants a workspace access to selected repositories.

Installing the GitHub App does not configure login, and enabling the Supabase provider does not install the GitHub App.

## Vercel environment inventory

| Variable | Preview | Production | Exposure | Notes |
|---|---:|---:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Required | Browser-safe | Use the URL for the intended Supabase project. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required* | Required* | Browser-safe | Preferred. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the supported legacy alternative. Never use the service-role key here. |
| `DATABASE_URL`, `DIRECT_URL` | Required | Required | Server-only | Must reach the migrated PostgreSQL database from Vercel. |
| `NEXT_PUBLIC_URL` | Recommended | Required | Browser-safe | Canonical production origin. OAuth initiation intentionally uses the browser's current origin so Preview callbacks remain on Preview. |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Required when storing OAuth provider tokens | Required | Server-only | 32-byte base64 key. |
| `GITHUB_APP_ID` | Required | Required | Server-only | Numeric ID of the same GitHub App named by the slug. |
| `GITHUB_APP_SLUG` | Required* | Required* | Server-only | Preferred install URL source. `GITHUB_APP_INSTALL_URL` is an optional alternative and must use `https://github.com`. |
| `GITHUB_APP_PRIVATE_KEY` | Required | Required | Server-only | Full PEM. In Vercel, paste literal multiline PEM or escaped `\n`; the application supports escaped newlines. |
| `GITHUB_APP_WEBHOOK_SECRET` | Required | Required | Server-only | Must match the GitHub App webhook secret. |

`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are **not read by this application**. Configure those OAuth values in Supabase instead. Apply Vercel variables to both Preview and Production when both environments are expected to work, then redeploy so `NEXT_PUBLIC_*` values are rebuilt into browser bundles.

## Supabase dashboard checklist

No dashboard credentials are available to automated tests. An owner must verify:

1. **Authentication → Providers → GitHub** is enabled and contains the GitHub OAuth App client ID and secret.
2. The GitHub OAuth App's authorization callback URL is exactly the callback displayed by Supabase, normally `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Authentication → URL Configuration → Site URL** is the production Context Compiler origin.
4. **Additional Redirect URLs** contains:
   - `https://<production-domain>/auth/callback`
   - the exact current Preview origin plus `/auth/callback`, or a narrowly scoped Vercel Preview wildcard supported by Supabase.
5. Preview and Production Vercel environments point to the intended Supabase project and publishable key.

The application passes `https://<current-browser-origin>/auth/callback` to Supabase. If that exact Preview callback is not allowlisted, Supabase may reject it or fall back to the Site URL.

## GitHub App dashboard checklist

1. The App slug matches `GITHUB_APP_SLUG`, and `GITHUB_APP_ID` and the private key belong to that App.
2. Set the **Setup URL** to `https://<deployment>/api/github-app/callback` and enable redirect-on-update if repository-selection changes should return to Context Compiler.
3. Set the webhook URL to `https://<deployment>/api/github-app/webhook` and use the same webhook secret as Vercel.
4. Grant repository **Contents: read-only** permission. Subscribe to installation, installation repositories, repository, and push events used by synchronization and re-index dispatch.
5. Make the App available to the intended accounts and repositories. Private repositories appear only when selected for the installation.

GitHub Apps have one configured Setup URL, so a production App normally returns to production. To exercise a Preview end-to-end, temporarily use that Preview callback on a non-production test App or maintain a separate Preview App with Preview-scoped Vercel credentials.

## Failure diagnosis

- OAuth start errors appear beside the initiating button. Callback failures end at `/auth/auth-code-error` with a safe category.
- GitHub App callback status appears on Settings. `invalid_state` means the callback did not match the short-lived, HttpOnly installation cookie; restart installation rather than reusing the callback URL.
- `provisioning_failed` means Supabase created a session but PostgreSQL user/workspace provisioning failed. Verify connectivity and migrations rather than bypassing protected-route checks.
- A successful App callback verifies the current Supabase user, the pending state, workspace access, installation identity, and then synchronizes all selected repositories with pagination.
