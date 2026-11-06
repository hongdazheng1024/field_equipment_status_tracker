import { pool } from "../db/pool.js";
import { staleCutoff, type EquipmentStatus } from "../equipment/rules.js";

export interface SiteSummary {
  id: number;
  name: string;
  total: number;
  staleCount: number;
  counts: Record<EquipmentStatus, number>;
}

interface SiteSummaryRow {
  site_id: number;
  name: string;
  total: number;
  stale_count: number;
  operational: number;
  degraded: number;
  down: number;
  in_maintenance: number;
}

/**
 * Every site with its live (not deleted) equipment counted per status, in one
 * query. LEFT JOIN keeps sites with no equipment (all counts 0).
 * count() returns bigint, which pg hands back as a string, hence ::int.
 */
export async function listSiteSummaries(now: Date): Promise<SiteSummary[]> {
  const { rows } = await pool.query<SiteSummaryRow>(
    `SELECT s.site_id, s.name,
            count(e.equip_id)::int                                               AS total,
            count(e.equip_id) FILTER (WHERE e.last_checked_at < $1)::int         AS stale_count,
            count(e.equip_id) FILTER (WHERE e.status = 'OPERATIONAL')::int       AS operational,
            count(e.equip_id) FILTER (WHERE e.status = 'DEGRADED')::int          AS degraded,
            count(e.equip_id) FILTER (WHERE e.status = 'DOWN')::int              AS down,
            count(e.equip_id) FILTER (WHERE e.status = 'IN_MAINTENANCE')::int    AS in_maintenance
       FROM sites s
       LEFT JOIN equipment e ON e.site_id = s.site_id AND e.deleted_at IS NULL
      GROUP BY s.site_id
      ORDER BY s.name`,
    [staleCutoff(now)],
  );

  return rows.map((r) => ({
    id: r.site_id,
    name: r.name,
    total: r.total,
    staleCount: r.stale_count,
    counts: {
      OPERATIONAL: r.operational,
      DEGRADED: r.degraded,
      DOWN: r.down,
      IN_MAINTENANCE: r.in_maintenance,
    },
  }));
}

/** Distinct equipment types in use, for the type filter dropdown. */
export async function listEquipmentTypes(): Promise<string[]> {
  const { rows } = await pool.query<{ type: string }>(
    "SELECT DISTINCT type FROM equipment WHERE deleted_at IS NULL ORDER BY type",
  );
  return rows.map((r) => r.type);
}
