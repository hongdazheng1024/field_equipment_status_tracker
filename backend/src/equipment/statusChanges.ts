import type pg from "pg";
import type { AuthUser } from "../auth/types.js";
import { pool, withTransaction } from "../db/pool.js";
import type { EquipmentStatus } from "./rules.js";
import type { StatusChangeBody } from "./schemas.js";

/** One entry in an item's change history. */
export interface StatusChange {
  id: string;
  equipmentId: number;
  changedAt: Date;
  oldStatus: EquipmentStatus;
  newStatus: EquipmentStatus;
  reason: string;
  user: { id: number; displayName: string };
}

interface StatusChangeRow {
  change_id: string;
  equip_id: number;
  changed_at: Date;
  old_status: EquipmentStatus;
  new_status: EquipmentStatus;
  reason: string;
  user_id: number;
  display_name: string;
}

const SELECT_CHANGE = `
  SELECT h.change_id, h.equip_id, h.changed_at, h.old_status, h.new_status, h.reason,
         h.user_id, u.display_name
    FROM equipment_status_history h
    JOIN users u ON u.user_id = h.user_id`;

function toStatusChange(row: StatusChangeRow): StatusChange {
  return {
    id: row.change_id,
    equipmentId: row.equip_id,
    changedAt: row.changed_at,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    reason: row.reason,
    user: { id: row.user_id, displayName: row.display_name },
  };
}

async function findChange(client: pg.PoolClient, changeId: string): Promise<StatusChange | null> {
  const { rows } = await client.query<StatusChangeRow>(`${SELECT_CHANGE} WHERE h.change_id = $1`, [changeId]);
  return rows[0] ? toStatusChange(rows[0]) : null;
}

export type ChangeStatusResult =
  | { kind: "applied"; change: StatusChange }
  | { kind: "replayed"; change: StatusChange } // same changeId sent again: nothing new written
  | { kind: "not_found" }
  | { kind: "version_conflict" } // someone else changed the item since the client loaded it
  | { kind: "change_id_taken" }; // changeId already used for a different item

/**
 * Updates an item's status and records why, as one transaction.
 *
 * `FOR UPDATE` locks the row until commit, so two requests for the same item
 * run one after the other: the second sees the first one's new version (and
 * gets a conflict) or its changeId (and gets a replay). Without the lock both
 * could read the same version and both write.
 */
export async function changeStatus(
  equipId: number,
  body: StatusChangeBody,
  user: AuthUser,
): Promise<ChangeStatusResult> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ status: EquipmentStatus; version: number }>(
      "SELECT status, version FROM equipment WHERE equip_id = $1 AND deleted_at IS NULL FOR UPDATE",
      [equipId],
    );
    const current = rows[0];

    // Checked before the version: a resent update carries the *old* version,
    // so it would otherwise look like a conflict with itself.
    if (body.changeId) {
      const existing = await findChange(client, body.changeId);
      if (existing) {
        return existing.equipmentId === equipId
          ? { kind: "replayed", change: existing }
          : { kind: "change_id_taken" };
      }
    }

    if (!current) return { kind: "not_found" };
    if (current.version !== body.version) return { kind: "version_conflict" };

    // now() is the transaction start time, so last_checked_at and the
    // history row's changed_at are identical.
    await client.query(
      `UPDATE equipment
          SET status = $2, last_checked_at = now(), updated_at = now(), version = version + 1
        WHERE equip_id = $1`,
      [equipId, body.status],
    );
    const { rows: inserted } = await client.query<{ change_id: string }>(
      `INSERT INTO equipment_status_history (change_id, equip_id, user_id, old_status, new_status, reason)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6)
       RETURNING change_id`,
      [body.changeId ?? null, equipId, user.id, current.status, body.status, body.reason],
    );

    const change = await findChange(client, inserted[0]!.change_id);
    return { kind: "applied", change: change! };
  });
}

/** An item's history, newest first. Null if the item doesn't exist (or was removed). */
export async function listStatusChanges(
  equipId: number,
  page: number,
  pageSize: number,
): Promise<{ items: StatusChange[]; total: number } | null> {
  const exists = await pool.query("SELECT 1 FROM equipment WHERE equip_id = $1 AND deleted_at IS NULL", [equipId]);
  if (!exists.rowCount) return null;

  const [rows, count] = await Promise.all([
    pool.query<StatusChangeRow>(
      `${SELECT_CHANGE} WHERE h.equip_id = $1
        ORDER BY h.changed_at DESC, h.change_id
        LIMIT $2 OFFSET $3`,
      [equipId, pageSize, (page - 1) * pageSize],
    ),
    pool.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM equipment_status_history WHERE equip_id = $1",
      [equipId],
    ),
  ]);
  return { items: rows.rows.map(toStatusChange), total: count.rows[0]!.total };
}
