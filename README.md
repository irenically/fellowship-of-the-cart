# The Fellowship of the Cart

**One list to rule them all.** A tiny grocery list for everyday household adventures.

React, strict TypeScript, Vite with its Oxc/Rolldown toolchain, Material UI with Emotion, and Supabase. Private household invite links, without accounts or an external authentication provider. The shared MUI theme lives in `src/styles/theme.tsx`; plain CSS handles the responsive page layout and watercolor artwork.

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

1. Create a Supabase project. Apply the SQL files in `supabase/migrations/` in filename order, once each, using the SQL editor. The first creates the original shopping table, the second removes the old name length limit, and the third adds household access rules. If the first two are already applied, run only `202610150003_households.sql`. **Save `original_household_link` from the third migration's result before closing the editor.** It opens your existing groceries, now in “Our household.” Keep this link private; it is not stored in plaintext in a permanent database table or available to new visitors. The temporary result table exists only for that SQL-editor session. The migration preserves every existing item and removes public access immediately, so apply it immediately before deploying the matching app update; older app builds cannot access lists afterward.
2. From the project's Connect/API settings, obtain the project URL and **publishable** client key. Never use a secret or service-role key.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in local `.env`. Set both or neither. Restart Vite after changing them.
4. For Pages, set the same names as GitHub repository **Actions variables** in Settings → Secrets and variables → Actions → Variables. These values are public and embedded in the bundle. Run the deployment workflow again after changing them.

Each household has a cryptographically random 256-bit invite secret. Links put the secret in the URL fragment, so GitHub Pages requests and referrers do not receive it. The browser sends it to Supabase over HTTPS in `x-household-key`. Only a SHA-256 hash is stored in a private database schema. Row-level security resolves that key and restricts all shopping operations to its household. Clients cannot list households, read hashes, or assign/move items to a different household. The public Supabase key alone no longer gives access to groceries. There are no user accounts, OAuth permissions, or auth sessions.

**Anyone with a household's link can read and modify that list.** Share it only with household members. This first version has no individual permissions, link rotation, recovery by email, or creation rate limiting; losing all copies of a link requires an administrator to issue a replacement. Household creation is intentionally available to visitors. A browser remembers the last verified household; explicit invite links take precedence, and invalid invites never fall back to a different list. Different tabs can keep different households open. Local-only data is not automatically uploaded.

The app fetches on startup and refreshes every five seconds while visible, plus on reconnect/window focus. Every fetch and write uses the household's scoped HTTP client. Realtime publication membership is removed because WebSocket authentication does not carry this custom HTTP header; HTTP polling avoids an unscoped event stream. A full refresh avoids stale event patches. Concurrent edits use last database write wins. Writes are never shown as successful before persistence; failed additions/edits retain their input. There is no offline write queue. Clearing removes only the current household's rows that are purchased when the statement executes.

The boundaries are [`src/lib/repository.ts`](src/lib/repository.ts), [`src/lib/household.ts`](src/lib/household.ts), and the household migration.

## Everyday use

- On first visit, create a named household or paste a household invite link. Open the same link on another device to share its list. “Copy invite link” shares access; “Switch household” lets you create or join another list without deleting the previous one.
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

Tests cover parsing/validation, ordering, local persistence/write failures, keyboard editing, completion and confirmation, plus private-link validation, explicit invite precedence, failed joins, creation retries, and switching without stale items. Run [`supabase/tests/household_isolation.sql`](supabase/tests/household_isolation.sql) only against a disposable PostgreSQL database after applying the migrations: its fixtures roll back and verify denied cross-household reads/writes, missing/unknown-key failures, private-table permissions, idempotent creation, and scoped clearing. `build` checks TypeScript and emits only ignored `dist/` output. Versions are locked in `package-lock.json`; `npm ci` reproduces them.

## GitHub Pages

Expected URL for the configured owner: **https://irenically.github.io/fellowship-of-the-cart/**.

The Vite base is `/fellowship-of-the-cart/`. `.github/workflows/pages.yml` runs lint, types, tests, and the production build on pushes to `main`, pull requests, and manual dispatch. Only main publishes the Pages artifact with scoped deployment permissions.

Enable Settings → Pages → Source → **GitHub Actions**. With authenticated GitHub CLI this can also be configured with:

```sh
gh api --method POST repos/irenically/fellowship-of-the-cart/pages -f build_type=workflow
```

If Pages already exists, use `--method PUT`. Push to main or manually run “Check and deploy to GitHub Pages”, then inspect the workflow deployment URL. Without Supabase variables, deployment uses local-only storage and will not synchronize across devices.

After applying the household migration to the real project, verify the deployment with disposable households A and B: open A's invite in two isolated browsers, add/edit/toggle/delete and check changes arrive within five seconds; B must not see or affect A, including “Clear gathered.” Check that bare public API credentials cannot read or write groceries. Interrupt a connection and verify recovery. Keep private invite links, `.env`, and privileged credentials out of Git and logs.
