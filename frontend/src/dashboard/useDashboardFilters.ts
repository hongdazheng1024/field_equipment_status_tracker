import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { STATUSES, type EquipmentStatus } from "../api/types";

/**
 * The dashboard's filters live in the URL query string, e.g.
 *   /?site=2&status=DOWN,DEGRADED&stale=1&type=Pump&q=gen&page=2
 * so a reload, the Back button or a shared link shows the same view.
 */
export interface DashboardFilters {
  siteId?: number; // undefined = all sites
  statuses: EquipmentStatus[]; // empty = any status
  stale: boolean;
  type?: string;
  q: string;
  page: number;
}

/** "12" -> 12; anything else (missing, "abc", "0", "-3") -> undefined. */
export function positiveInt(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= 1 ? n : undefined;
}

/** Reads filters from the URL. Anything malformed is ignored rather than sent to the API. */
export function parseFilters(params: URLSearchParams): DashboardFilters {
  const statuses = (params.get("status") ?? "")
    .split(",")
    .filter((s): s is EquipmentStatus => (STATUSES as readonly string[]).includes(s));

  return {
    siteId: positiveInt(params.get("site")),
    statuses: [...new Set(statuses)],
    stale: params.get("stale") === "1",
    type: params.get("type") || undefined,
    q: params.get("q") ?? "",
    page: positiveInt(params.get("page")) ?? 1,
  };
}

/** Writes filters back, leaving defaults out so the URL stays short. */
export function toSearchParams(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.siteId) params.set("site", String(filters.siteId));
  if (filters.statuses.length) params.set("status", filters.statuses.join(","));
  if (filters.stale) params.set("stale", "1");
  if (filters.type) params.set("type", filters.type);
  if (filters.q) params.set("q", filters.q);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function hasActiveFilters(filters: DashboardFilters): boolean {
  return filters.statuses.length > 0 || filters.stale || !!filters.type || !!filters.q;
}

export function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  /**
   * Merges a change into the filters. Any change other than the page itself
   * goes back to page 1, since the old page number may no longer exist.
   * `replace` is for search typing, so each keystroke doesn't add a history entry.
   */
  const updateFilters = useCallback(
    (patch: Partial<DashboardFilters>, options: { replace?: boolean } = {}) => {
      setSearchParams(
        (current) => {
          const next = { ...parseFilters(current), page: 1, ...patch };
          // Keep keys this hook doesn't own (e.g. ?edit=31 for the edit panel later).
          const params = toSearchParams(next);
          for (const [key, value] of current) {
            if (!["site", "status", "stale", "type", "q", "page"].includes(key)) params.set(key, value);
          }
          return params;
        },
        { replace: options.replace },
      );
    },
    [setSearchParams],
  );

  return { filters, updateFilters };
}
