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

## Design notes (so far)

- **Conflict protection: optimistic concurrency.** Each equipment row has a `version`. Writes send the version they read; the `UPDATE ... WHERE version = $n` affects 0 rows if someone else changed it first, and the API returns `409 CONFLICT` with the current state. No locks to go stale when a field device drops off the network.
- **Soft delete** (`deleted_at`) so change history survives when a supervisor removes an item.
- **History IDs are UUIDs** so an offline client can generate them; replaying a queued update twice hits the primary key rather than double-applying.
- **Status update + history insert run in one transaction.**
- **Consistent errors:** `{ "error": { "code", "message", "details?" } }`.
- **Stateless JWT auth (HS256, 12h ≈ one shift).** It survives spotty connections because there's no server session. The acting user for history comes from the verified token, never the request body. 401 means not authenticated, 403 means wrong role. Trade-off: no server-side logout or revocation (logout drops the token on the client), and a role change applies at the next login.

## AI usage

Claude (Claude Code) helped design the schema and scaffold the backend: migration runner, seed script, error handling, JWT auth middleware and its tests.
