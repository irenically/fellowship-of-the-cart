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

1. Set the GitHub repository Actions secret `SUPABASE_DB_URL` to the Supabase **Connect → Session pooler** PostgreSQL connection string, with the database password filled in and URL-encoded. This privileged connection belongs only in Actions secrets, never frontend variables or Git.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as repository Actions variables. For local development, use `.env.local` instead. These are public client settings; never use a service-role key.
3. Push to `main`. GitHub Actions checks the app and migrations against a disposable PostgreSQL database, applies pending migrations to Supabase, then publishes Pages. A failed database update stops frontend deployment. Future SQL changes belong in a new file under `supabase/migrations/`; no routine SQL-editor steps are needed.

The first automated deployment recognizes the known migrations already applied through the SQL editor and registers completed migrations with the Supabase CLI. The independent item-name migration is also applied if it was skipped during manual household setup. Existing groceries are preserved. Later deployments use the CLI migration history and apply only pending files; reruns are safe. An inconsistent historical schema stops deployment for inspection rather than guessing which changes succeeded.

If migrating an old installation from before migration 003, retain its original private household link before enabling automation so its groceries can be claimed. Automated deployment logs intentionally omit that private link. Existing link-based households can open their saved link once to choose an ID and password; new invitations then use the current sign-in flow.

Creating a household suggests a readable ID from its name: "My Household" becomes `my-household`. IDs contain 3-64 lowercase ASCII letters, numbers, and single hyphens. Accents are normalized; names with no ASCII letters/numbers fall back to `household`. The ID is editable, and a duplicate ID asks the creator to choose another. Display names do not have to be unique.

Passwords have no application length or complexity rules; only a non-empty value is required, and whitespace is preserved. New passwords are hashed in full with SHA-256, then salted with pgcrypto bcrypt at cost 10. This fixed-size intermediate value avoids bcrypt's native truncation of long input. Only tagged password hashes live in the private database schema. Existing bcrypt passwords continue to work and upgrade after successful password sign-in; signing in through an invite never replaces the household password. Everyone using the same ID/password has equal access to that household. There are no emails, OAuth permissions, personal accounts, or external authentication services. Forgotten passwords currently require administrator recovery; there is no reset-by-email or password-change screen.

Successful creation/sign-in issues a separate random 256-bit access token with no expiration. The browser remembers only this token, never the shared password, and sends it over HTTPS in `x-household-key`. Only its hash is stored in the private session table. There is no token renewal or background authentication refresh. Sign-out deletes this device's token and clears its browser storage, while other members stay signed in. The saved household is checked once when opening the app; normal grocery requests rely directly on database household rules.

Database row-level security resolves the session and scopes every shopping operation to its household. Clients cannot list households, read password/session hashes, or assign an item to another household. Public Supabase credentials alone provide no grocery access. Passwordless legacy links are accepted only until their household completes password setup. Switching households discards the previous list UI before loading the next one; local-only groceries are never silently uploaded.

Wrong credentials produce a simple incorrect-ID-or-password message. There are no password-strength rules, lockout timers, or individual-member roles. Household creation is available to visitors.

The app fetches on startup and refreshes every five seconds while visible, plus on reconnect/window focus. Grocery synchronization is separate from sign-in; it does not renew or refresh authentication. All operations use the household's scoped HTTP client; Realtime sockets do not carry this HTTP header, so polling avoids an unscoped event stream. Concurrent edits use last database write wins. Writes are only shown as successful after persistence, failed additions/edits retain their drafts, and there is no offline write queue. Clearing removes only the current household's gathered rows.

"Invite members" generates and copies a permanent link directly using the current sign-in; no password prompt. The link fills the household ID and password fields with a household-scoped invite credential, then the recipient presses Sign in. Neither the link nor the remembered sign-in expires. The shared password is not recovered or retained. Invite credentials are hashed in a private database table and carried in the URL fragment. Anyone holding a link can join that household. The app clears the incoming fragment after filling the form and gives invites priority over saved households. Clipboard failures leave a selectable link for manual copying.

The boundaries are [`src/lib/repository.ts`](src/lib/repository.ts), [`src/lib/household.ts`](src/lib/household.ts), and the household migrations.

## Everyday use

- Choose "Create household," enter its name, choose/accept the suggested ID, and set/confirm a password. Members choose "Sign in" and use that same ID/password. "Invite members" copies a link that fills both fields without asking for the password again; the panel can also copy just the household ID. "Switch household" opens sign-in for another household; "Sign out" revokes this browser's session.
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

Tests cover grocery operations, arbitrary non-empty passwords, invite prefill, creation retries, switching without stale items, legacy conversion, and sign-out. After migrations 001-007, run `supabase/tests/permanent_household_access.sql` and `supabase/tests/unrestricted_passwords.sql` only against a disposable PostgreSQL database; fixtures roll back. They verify permanent reusable invites, no expiration columns or lockouts, sign-out revocation, household separation, full long-password matching, and existing-password compatibility. Earlier SQL test files describe their applicable historical migration versions.

Browser verification uses isolated browser contexts and real disposable local PostgreSQL behind an intercepted REST adapter. It verifies creation, a second member signing in and syncing, switching, sign-out/revocation, session resumption, legacy conversion, and mobile/desktop layout without touching live groceries. `build` checks TypeScript and emits ignored `dist/` output. Versions are locked in `package-lock.json`; `npm ci` reproduces them.

## GitHub Pages

Expected URL for the configured owner: **https://irenically.github.io/fellowship-of-the-cart/**.

The Vite base is `/fellowship-of-the-cart/`. `.github/workflows/pages.yml` runs lint, types, tests, and the production build on pushes to `main`, pull requests, and manual dispatch. Only main applies live migrations and publishes the Pages artifact with scoped deployment permissions. Pull requests never receive the database secret. Deployments are serialized so a newer push cannot cancel an in-progress migration.

Enable Settings → Pages → Source → **GitHub Actions**. With authenticated GitHub CLI this can also be configured with:

```sh
gh api --method POST repos/irenically/fellowship-of-the-cart/pages -f build_type=workflow
```

If Pages already exists, use `--method PUT`. Push to main or manually run “Check and deploy to GitHub Pages”, then inspect the workflow deployment URL. Without Supabase variables, deployment uses local-only storage and will not synchronize across devices.

After applying migration 004 to the real project and deploying, verify with disposable households A and B: sign into A in two isolated browsers, add/edit/toggle/delete and check updates within five seconds; B must not see or change A, including "Clear gathered." Verify wrong passwords fail, sign-out invalidates that browser's session, and reconnecting recovers correctly. Keep passwords, session tokens, legacy invite links, `.env`, and privileged credentials out of Git and logs.
