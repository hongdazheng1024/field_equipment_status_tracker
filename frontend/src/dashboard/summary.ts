import { STATUSES, type EquipmentStatus, type SiteSummary } from "../api/types";

export interface StatusSummary {
  total: number;
  staleCount: number;
  counts: Record<EquipmentStatus, number>;
}

function emptyCounts(): Record<EquipmentStatus, number> {
  return { OPERATIONAL: 0, DEGRADED: 0, DOWN: 0, IN_MAINTENANCE: 0 };
}

/**
 * Stat card numbers. Comes from the per-site counts in GET /api/sites, not
 * from the table rows: the table only holds one page, so counting its rows
 * would undercount. No site selected = every site added together.
 */
export function summarize(sites: SiteSummary[], siteId?: number): StatusSummary {
  const selected = siteId === undefined ? sites : sites.filter((s) => s.id === siteId);
  const summary: StatusSummary = { total: 0, staleCount: 0, counts: emptyCounts() };
  for (const site of selected) {
    summary.total += site.total;
    summary.staleCount += site.staleCount;
    for (const status of STATUSES) summary.counts[status] += site.counts[status];
  }
  return summary;
}
