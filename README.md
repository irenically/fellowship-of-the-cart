# The Fellowship of the Cart

**One list to rule them all.** A tiny grocery list for everyday household adventures.

React, strict TypeScript, Vite with its Oxc/Rolldown toolchain, Material UI with Emotion, and Supabase. Household IDs and shared passwords, without personal accounts or an external authentication provider. The shared MUI theme lives in `src/styles/theme.tsx`; plain CSS handles the responsive page layout and watercolor artwork.

## Run locally

Use Node.js 24 LTS and npm:

```sh
npm ci
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env`. If script execution is restricted, use `npm.cmd` instead of `npm`.

Leave both environment variables empty for **local-only mode**: data persists only in this browser; it does not synchronize across devices. Connection-mode banners are intentionally omitted from the UI. Tabs on the same origin receive storage updates. Storage errors are reported. Local data is not automatically uploaded when switching to Supabase.

## Enable shared households

1. Apply the SQL files in `supabase/migrations/` in filename order, once each, using the Supabase SQL editor. If migrations 001-003 are already applied, run only `202610160004_household_passwords.sql`. It enables pgcrypto in the standard `extensions` schema and adds password sign-in and sessions without moving or deleting groceries.
2. If you have not run migration 003 yet, **save its returned `original_household_link` before closing the editor**, then apply 004. Open that old link once in the updated app to choose an ID and password for your existing groceries. Other link-based households follow the same one-time setup. Once a password is set, old invite links stop working; members must sign in with the shared ID and password.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in local `.env.local` (both or neither), using the project's public URL and publishable client key. Never use a service-role/secret key. Restart Vite after changing these settings.
4. For Pages, set the same names as GitHub repository **Actions variables**, then push/deploy the matching app update. These settings are public configuration; household passwords and sessions must never become environment variables or repository contents.

Creating a household suggests a readable ID from its name: "My Household" becomes `my-household`. IDs contain 3-64 lowercase ASCII letters, numbers, and single hyphens. Accents are normalized; names with no ASCII letters/numbers fall back to `household`. The ID is editable, and a duplicate ID asks the creator to choose another. Display names do not have to be unique.

Passwords are verified server-side using pgcrypto bcrypt with a random salt and cost 10. Only password hashes live in the private database schema. Passwords require at least 8 characters and are limited to 72 UTF-8 bytes to prevent bcrypt's silent truncation; leading/trailing characters are preserved. Everyone using the same ID/password has equal access to that household. There are no emails, OAuth permissions, personal accounts, or external authentication services. Forgotten passwords currently require administrator recovery; there is no reset-by-email or password-change screen.

Successful creation/sign-in issues a separate random 256-bit session token, valid for 30 days. The browser remembers only this token, never the password, and sends it over HTTPS in `x-household-key`. Session tokens are not placed in URLs; only their SHA-256 hashes are stored in the private session table. Sign-out deletes the current server session and clears the browser's saved session. It does not sign out other household members. Expired sessions cannot read or write groceries. The last verified session is resumed on startup; different tabs can use different households.

Database row-level security resolves the session and scopes every shopping operation to its household. Clients cannot list households, read password/session hashes, or assign an item to another household. Public Supabase credentials alone provide no grocery access. Passwordless legacy links are accepted only until their household completes password setup. Switching households discards the previous list UI before loading the next one; local-only groceries are never silently uploaded.

Failed sign-ins use a generic incorrect-ID-or-password response. Eight incorrect passwords within five minutes lock that household's sign-in for one minute; failed counters persist because the RPC returns errors as data rather than rolling back. The lock is shared across members, so deliberate attempts can temporarily lock a known household ID. Household creation remains publicly available and is not rate limited. These are shared household credentials, without individual-member roles or auditing.

The app fetches on startup and refreshes every five seconds while visible, plus on reconnect/window focus. Every list refresh verifies its session before reading items. All operations use the household's scoped HTTP client; Realtime sockets do not carry this HTTP header, so polling avoids an unscoped event stream. Concurrent edits use last database write wins. Writes are only shown as successful after persistence, failed additions/edits retain their drafts, and there is no offline write queue. Clearing removes only the current household's gathered rows.

The boundaries are [`src/lib/repository.ts`](src/lib/repository.ts), [`src/lib/household.ts`](src/lib/household.ts), and the household migrations.

## Everyday use

- Choose "Create household," enter its name, choose/accept the suggested ID, and set/confirm a password. Members choose "Sign in" and use that same ID/password. "Copy household ID" copies only the public ID; share the password separately. "Switch household" opens sign-in for another household; "Sign out" revokes this browser's session.
- Type a name and press Enter or Add. Names are trimmed, duplicates allowed, and defaults are 1 piece.
- Tap the pencil to edit an item in its row. Names and quantities are plain text. Enter/Save persists changes; Escape/Cancel discards the draft and returns focus to the pencil.
- Quantities accept comma or period decimals, up to three decimal places, between 0 and 999999 (exclusive of zero). Units: piece, g, kg, ml, l. No conversions.
- One checkbox tap gathers a provision. Gathered items remain below active items and can be unchecked.
- Delete an individual item with its labelled × control. Clear gathered asks for confirmation.

## Quality checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

Tests cover parsing/validation, local persistence, keyboard editing, and confirmation, plus ID suggestions, password byte limits, missing setup, wrong credentials, rate-limit messages, creation retries, household switching, legacy conversion, and sign-out. Run [`supabase/tests/household_passwords.sql`](supabase/tests/household_passwords.sql) only against a disposable PostgreSQL database after migrations 001-004; fixtures roll back. It checks real bcrypt hashing, duplicate IDs, failed-attempt persistence, expiry, logout, denied cross-household access, private-table permissions, and conversion without losing groceries. The older `household_isolation.sql` applies only to the legacy state after 003 and before 004.

Browser verification uses isolated browser contexts and real disposable local PostgreSQL behind an intercepted REST adapter. It verifies creation, a second member signing in and syncing, switching, sign-out/revocation, session resumption, legacy conversion, and mobile/desktop layout without touching live groceries. `build` checks TypeScript and emits ignored `dist/` output. Versions are locked in `package-lock.json`; `npm ci` reproduces them.

## GitHub Pages

Expected URL for the configured owner: **https://irenically.github.io/fellowship-of-the-cart/**.

The Vite base is `/fellowship-of-the-cart/`. `.github/workflows/pages.yml` runs lint, types, tests, and the production build on pushes to `main`, pull requests, and manual dispatch. Only main publishes the Pages artifact with scoped deployment permissions.

Enable Settings → Pages → Source → **GitHub Actions**. With authenticated GitHub CLI this can also be configured with:

```sh
gh api --method POST repos/irenically/fellowship-of-the-cart/pages -f build_type=workflow
```

If Pages already exists, use `--method PUT`. Push to main or manually run “Check and deploy to GitHub Pages”, then inspect the workflow deployment URL. Without Supabase variables, deployment uses local-only storage and will not synchronize across devices.

After applying migration 004 to the real project and deploying, verify with disposable households A and B: sign into A in two isolated browsers, add/edit/toggle/delete and check updates within five seconds; B must not see or change A, including "Clear gathered." Verify wrong passwords fail, sign-out invalidates that browser's session, and reconnecting recovers correctly. Keep passwords, session tokens, legacy invite links, `.env`, and privileged credentials out of Git and logs.
