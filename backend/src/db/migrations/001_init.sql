-- Initial schema: users, sites, equipment, equipment status history.

CREATE TYPE equipment_status AS ENUM ('OPERATIONAL', 'DEGRADED', 'DOWN', 'IN_MAINTENANCE');
CREATE TYPE user_role AS ENUM ('OPERATOR', 'SUPERVISOR');

CREATE TABLE users (
  user_id       SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  site_id SERIAL PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE
);

CREATE TABLE equipment (
  equip_id        SERIAL PRIMARY KEY,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  type            TEXT NOT NULL CHECK (length(trim(type)) > 0),
  site_id         INT NOT NULL REFERENCES sites (site_id),
  status          equipment_status NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Optimistic concurrency: every write must send the version it read;
  -- the UPDATE only succeeds if it still matches (otherwise 409 Conflict).
  version         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Soft delete so history survives when a supervisor removes an item.
  deleted_at      TIMESTAMPTZ
);

-- Filters by site/status and the per-site summary only look at live rows.
CREATE INDEX equipment_site_status_idx ON equipment (site_id, status) WHERE deleted_at IS NULL;
CREATE INDEX equipment_last_checked_idx ON equipment (last_checked_at) WHERE deleted_at IS NULL;

CREATE TABLE equipment_status_history (
  -- UUID so an offline client can generate it; replaying the same
  -- queued update twice hits the primary key instead of double-applying.
  change_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equip_id    INT NOT NULL REFERENCES equipment (equip_id),
  user_id     INT NOT NULL REFERENCES users (user_id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_status  equipment_status NOT NULL,
  new_status  equipment_status NOT NULL,
  reason      TEXT NOT NULL CHECK (length(trim(reason)) > 0)
);

CREATE INDEX equipment_status_history_equip_idx
  ON equipment_status_history (equip_id, changed_at DESC);
