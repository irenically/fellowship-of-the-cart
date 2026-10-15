# The Fellowship of the Cart

**One list to rule them all.** A tiny grocery list for everyday household adventures.

React, strict TypeScript, Vite with its Oxc/Rolldown toolchain, plain CSS, and Supabase. No accounts, navigation, or unnecessary ceremony.

## Run locally

Use Node.js 24 LTS and npm:

```sh
npm ci
cp .env.example .env
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env`. If script execution is restricted, use `npm.cmd` instead of `npm`.

Leave both environment variables empty for **local-only mode**: data persists only in this browser; it does not synchronize across devices. Connection-mode banners are intentionally omitted from the UI. Tabs on the same origin receive storage updates. Storage errors are reported. Local data is not automatically uploaded when switching to Supabase.

## Enable the shared list

1. Create a Supabase project. Apply the SQL files in `supabase/migrations/` in filename order, once each, using the SQL editor or Supabase migrations. The first creates the shopping table, constraints, timestamp trigger, explicit column grants, RLS policies, and Realtime publication membership. The second removes the old 120-character name limit while retaining non-blank name validation. For an existing project that already ran the first migration, run only `202610150002_unlimited_item_names.sql`.
2. From the project's Connect/API settings, obtain the project URL and **publishable** client key. Never use a secret or service-role key.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in local `.env`. Set both or neither. Restart Vite after changing them.
4. For Pages, set the same names as GitHub repository **Actions variables** in Settings → Secrets and variables → Actions → Variables. These values are public and embedded in the bundle. Run the deployment workflow again after changing them.

**This prototype is public, not private or access-controlled.** Anyone with the public client configuration can read, add, edit, and delete the entire shared list. RLS deliberately permits those operations for `anon` on this one table; it is not household authorization. Use a dedicated prototype database, do not store sensitive information, and monitor usage. No other table receives grants from this migration. Application input validation is backed by database name, unit, and quantity constraints.

The app fetches on startup, subscribes to Supabase Realtime changes, refreshes on reconnect/window focus, and polls every 15 seconds as a fallback. A full refresh avoids applying stale out-of-order event patches. Concurrent edits to the same field use last database write wins. Writes are never shown as successful before persistence. A failed write retains the previous item and displays an error; failed additions retain their input. There is no offline write queue. Clearing removes rows that are purchased when the database statement executes.

The data-access boundary is [`src/lib/repository.ts`](src/lib/repository.ts); future household authorization can replace its policies and implementation without restructuring the UI.

## Everyday use

- Type a name and press Enter or Add. Names are trimmed, duplicates allowed, and defaults are 1 piece.
- Tap a name to edit in its row. Change name, quantity or unit; Enter/Save persists, Escape/Cancel discards the draft.
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

Tests cover parsing and formatting, validation, ordering, local persistence and write failures, plus keyboard addition, editing/cancel, completion, confirmation, and duplicate submission prevention. `build` checks TypeScript and emits only ignored `dist/` output. Versions are locked in `package-lock.json`; `npm ci` reproduces them.

## GitHub Pages

Expected URL for the configured owner: **https://irenically.github.io/fellowship-of-the-cart/**.

The Vite base is `/fellowship-of-the-cart/`. `.github/workflows/pages.yml` runs lint, types, tests, and the production build on pushes to `main`, pull requests, and manual dispatch. Only main publishes the Pages artifact with scoped deployment permissions.

Enable Settings → Pages → Source → **GitHub Actions**. With authenticated GitHub CLI this can also be configured with:

```sh
gh api --method POST repos/irenically/fellowship-of-the-cart/pages -f build_type=workflow
```

If Pages already exists, use `--method PUT`. Push to main or manually run “Check and deploy to GitHub Pages”, then inspect the workflow deployment URL. Without Supabase variables, deployment uses local-only storage and will not synchronize across devices.

The SQL and two-client Supabase synchronization require a real project and must be verified after configuration: open the site in two browsers, add/edit/toggle/delete from each and check the other updates, then interrupt one connection and verify recovery. Never commit `.env` or privileged credentials.
