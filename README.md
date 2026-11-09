# Field Equipment Status Tracker

Track equipment status across field sites, with change history, stale-check highlighting, and conflict-safe updates.

## Running the backend

Requires Node 20+ (`nvm use` picks it up from `.nvmrc`) and a local PostgreSQL.

```bash
cd backend
cp .env.example .env          # adjust DATABASE_URL if needed
createdb field_equipment
npm install
npm run db:reset              # drop, migrate, seed
npm run dev                   # http://localhost:4000/api/health
```

Seeded accounts (password `password`): `olivia`, `omar` (operators), `sara` (supervisor).

| Script | What it does |
|---|---|
| `npm run dev` | API with reload on change |
| `npm run db:migrate` | Apply pending SQL migrations in `src/db/migrations` |
| `npm run db:seed` | Replace all data with deterministic seed data (3 sites, 75 items) |
| `npm run db:reset` | Drop schema, migrate, seed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest. Creates and resets `field_equipment_test` automatically, never touches the dev DB |

## Auth

Mock login with real checks: `POST /api/auth/login { username, password }` returns `{ token, user }`. Send `Authorization: Bearer <token>` on every other request. `GET /api/auth/me` returns the current user.

| Action | Operator | Supervisor |
|---|---|---|
| View equipment, history, site summary | ✅ | ✅ |
| Update status (with reason) | ✅ | ✅ |
| Add / remove equipment | ❌ 403 | ✅ |

## API

All routes except health and login need `Authorization: Bearer <token>`.

| Method | Path | Role | Notes |
|---|---|---|---|
| `GET` | `/api/sites` | any | Sites with per-status counts and `staleCount`, plus `types` for the type filter. One call feeds the sidebar, stat cards and dropdown |
| `GET` | `/api/equipment` | any | `q` (name/type search), `siteId`, `type`, `status=DOWN,DEGRADED`, `stale=true\|false`, `sort=name\|lastCheckedAt\|status\|site`, `order`, `page`, `pageSize` (max 100). Returns `{ data, page, pageSize, total }` |
| `GET` | `/api/equipment/:id` | any | One item, including `version` and `lastCheckedBy` |
| `POST` | `/api/equipment/:id/status-changes` | any | `{ status, reason, version, changeId? }` → `201 { data: { equipment, change } }`. Same status allowed (a check-in). `409` with `details.current` if `version` is outdated; `200` with the original change if `changeId` was already applied |
| `GET` | `/api/equipment/:id/status-changes` | any | History, newest first: who, when, old/new status, reason. Paginated |
| `POST` | `/api/equipment` | supervisor | `{ name, type, siteId, status }` → `201` with `Location` |
| `DELETE` | `/api/equipment/:id?version=N` | supervisor | Soft delete → `204`; `409` if changed since loaded |

Seed dates are relative to when you seeded, so items drift into "stale" over the days; `npm run db:reset` refreshes them.

## Design notes (so far)

- **Conflict protection: optimistic concurrency.** Each equipment row has a `version`. Every write sends the version the client loaded; if the row has moved on, the API returns `409 CONFLICT` with the current state (and who changed it) instead of overwriting. Nothing stays locked between requests, so nothing gets stuck when a field device drops off the network.
- **Status change = one transaction with a row lock.** `SELECT ... FOR UPDATE` locks the item only for the few milliseconds of the request, so the version check, the update and the history insert can't interleave with another request. A test fires two simultaneous edits and expects exactly one `201` and one `409`; removing the lock makes it fail.
- **Safe resends (`changeId`).** The client may send its own UUID per change. If that id was already applied, the API returns the original result (`200`) instead of applying it again, which is what an offline queue needs when it isn't sure a request got through.
- **Soft delete** (`deleted_at`) so change history survives when a supervisor removes an item. Delete also requires the current `version`.
- **Same-status updates are check-ins**: they refresh `last_checked_at` and are logged with old = new status.
- **`last_checked_at` uses server time.** For offline sync, a queued update should carry when the check actually happened. That's the next step for the offline stretch goal.
- **Consistent errors:** `{ "error": { "code", "message", "details?" } }`.
- **Stale rule in one place.** `equipment/rules.ts` defines "over 7 days"; both the SQL `stale` filter and each row's `isStale` use it, and the server's clock decides, not each device's.
- **Types come with `/api/sites`, not the list response.** The list re-runs on every filter and page change; types are reference data that rarely change. Putting them in a filtered response would also make picking a type remove the other options from the dropdown.
- **Offset pagination with a tie-breaker** (`ORDER BY <sort>, equip_id`), so rows never repeat or go missing between pages. Fine for hundreds of items; keyset pagination is the next step for much larger sites.
- **Stateless JWT auth (HS256, 12h ≈ one shift).** It survives spotty connections because there's no server session. The acting user for history comes from the verified token, never the request body. 401 means not authenticated, 403 means wrong role. Trade-off: no server-side logout or revocation (logout drops the token on the client), and a role change applies at the next login.

## Skipped (so far)

- Editing an item's name, type or site (not in the brief; status updates only).
- `created_by` on equipment: who added an item isn't recorded.
- History of removed items isn't exposed through the API (it stays in the database).

## AI usage

Claude (Claude Code) helped design the schema and scaffold the backend: migration runner, seed script, error handling, JWT auth middleware, the equipment/sites/status-change endpoints and their tests.
