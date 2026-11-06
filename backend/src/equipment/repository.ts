import { pool } from "../db/pool.js";
import { isStale, staleCutoff, type EquipmentStatus } from "./rules.js";
import type { ListQuery } from "./schemas.js";

/** The equipment shape every endpoint returns. */
export interface Equipment {
  id: number;
  name: string;
  type: string;
  site: { id: number; name: string };
  status: EquipmentStatus;
  lastCheckedAt: Date;
  lastCheckedBy: { id: number; displayName: string } | null;
  isStale: boolean;
  version: number;
}

interface EquipmentRow {
  equip_id: number;
  name: string;
  type: string;
  site_id: number;
  site_name: string;
  status: EquipmentStatus;
  last_checked_at: Date;
  last_checked_by_id: number | null;
  last_checked_by_name: string | null;
  version: number;
}

// Shared SELECT for list and detail. The LATERAL join picks the most recent
// history row so the UI can show who last updated the item (null if never).
const SELECT_EQUIPMENT = `
  SELECT e.equip_id, e.name, e.type, e.site_id, s.name AS site_name, e.status,
         e.last_checked_at, e.version,
         lc.user_id AS last_checked_by_id, lc.display_name AS last_checked_by_name
    FROM equipment e
    JOIN sites s ON s.site_id = e.site_id
    LEFT JOIN LATERAL (
      SELECT h.user_id, u.display_name
        FROM equipment_status_history h
        JOIN users u ON u.user_id = h.user_id
       WHERE h.equip_id = e.equip_id
       ORDER BY h.changed_at DESC
       LIMIT 1
    ) lc ON true`;

function toEquipment(row: EquipmentRow, now: Date): Equipment {
  return {
    id: row.equip_id,
    name: row.name,
    type: row.type,
    site: { id: row.site_id, name: row.site_name },
    status: row.status,
    lastCheckedAt: row.last_checked_at,
    lastCheckedBy:
      row.last_checked_by_id === null
        ? null
        : { id: row.last_checked_by_id, displayName: row.last_checked_by_name! },
    isStale: isStale(row.last_checked_at, now),
    version: row.version,
  };
}

// API sort names -> SQL columns. Only these fixed strings are ever placed in
// ORDER BY, so the sort parameter can't inject SQL.
const SORT_COLUMNS: Record<ListQuery["sort"], string> = {
  name: "e.name",
  lastCheckedAt: "e.last_checked_at",
  status: "e.status",
  site: "s.name",
};

/** Escape LIKE wildcards so searching for "%" or "_" matches them literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listEquipment(
  query: ListQuery,
  now: Date,
): Promise<{ items: Equipment[]; total: number }> {
  const where = ["e.deleted_at IS NULL"];
  const params: unknown[] = [];
  // Adds a value to the parameter list and returns its placeholder ($1, $2, ...).
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (query.siteId !== undefined) where.push(`e.site_id = ${param(query.siteId)}`);
  if (query.type !== undefined) where.push(`e.type = ${param(query.type)}`);
  if (query.status !== undefined) where.push(`e.status = ANY(${param(query.status)}::equipment_status[])`);
  if (query.stale !== undefined) {
    const op = query.stale ? "<" : ">=";
    where.push(`e.last_checked_at ${op} ${param(staleCutoff(now))}`);
  }
  if (query.q !== undefined) {
    const pattern = param(`%${escapeLike(query.q)}%`);
    where.push(`(e.name ILIKE ${pattern} OR e.type ILIKE ${pattern})`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const direction = query.order === "desc" ? "DESC" : "ASC";
  // equip_id breaks ties so rows never repeat or vanish between pages.
  const orderSql = `ORDER BY ${SORT_COLUMNS[query.sort]} ${direction}, e.equip_id ${direction}`;
  const filterParams = [...params];
  const limit = param(query.pageSize);
  const offset = param((query.page - 1) * query.pageSize);

  // Two queries rather than COUNT(*) OVER (): that trick returns no total
  // when the page is past the end, which the UI needs to recover.
  const [page, count] = await Promise.all([
    pool.query<EquipmentRow>(`${SELECT_EQUIPMENT} ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`, params),
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM equipment e JOIN sites s ON s.site_id = e.site_id ${whereSql}`,
      filterParams,
    ),
  ]);

  return { items: page.rows.map((r) => toEquipment(r, now)), total: count.rows[0]!.total };
}

/** One live item, or null if it doesn't exist or was soft-deleted. */
export async function getEquipment(id: number, now: Date): Promise<Equipment | null> {
  const { rows } = await pool.query<EquipmentRow>(
    `${SELECT_EQUIPMENT} WHERE e.equip_id = $1 AND e.deleted_at IS NULL`,
    [id],
  );
  return rows[0] ? toEquipment(rows[0], now) : null;
}
