import { describe, expect, it } from "vitest";
import type { SiteSummary } from "../api/types";
import { formatRelative } from "./format";
import { pageItems } from "./pageItems";
import { summarize } from "./summary";
import { parseFilters, toSearchParams } from "./useDashboardFilters";

describe("parseFilters / toSearchParams", () => {
  it("round-trips a full set of filters", () => {
    const params = new URLSearchParams("site=2&status=DOWN,DEGRADED&stale=1&type=Pump&q=gen&page=3");
    const filters = parseFilters(params);
    expect(filters).toEqual({ siteId: 2, statuses: ["DOWN", "DEGRADED"], stale: true, type: "Pump", q: "gen", page: 3 });
    expect(toSearchParams(filters).toString()).toBe(params.toString());
  });

  it("ignores malformed values instead of sending them to the API", () => {
    expect(parseFilters(new URLSearchParams("site=abc&status=BROKEN,DOWN,DOWN&page=-1&stale=yes"))).toEqual({
      siteId: undefined,
      statuses: ["DOWN"],
      stale: false,
      type: undefined,
      q: "",
      page: 1,
    });
  });

  it("leaves defaults out of the URL", () => {
    expect(toSearchParams({ statuses: [], stale: false, q: "", page: 1 }).toString()).toBe("");
  });
});

describe("summarize", () => {
  const sites: SiteSummary[] = [
    { id: 1, name: "A", total: 3, staleCount: 1, counts: { OPERATIONAL: 1, DEGRADED: 1, DOWN: 1, IN_MAINTENANCE: 0 } },
    { id: 2, name: "B", total: 2, staleCount: 0, counts: { OPERATIONAL: 0, DEGRADED: 0, DOWN: 2, IN_MAINTENANCE: 0 } },
  ];

  it("adds up all sites when none is selected", () => {
    expect(summarize(sites)).toEqual({
      total: 5,
      staleCount: 1,
      counts: { OPERATIONAL: 1, DEGRADED: 1, DOWN: 3, IN_MAINTENANCE: 0 },
    });
  });

  it("uses only the selected site", () => {
    expect(summarize(sites, 2).total).toBe(2);
  });

  it("is all zeros for an unknown site", () => {
    expect(summarize(sites, 99).total).toBe(0);
  });
});

describe("pageItems", () => {
  it("lists every page when there are few", () => {
    expect(pageItems(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("collapses long ranges around the current page", () => {
    expect(pageItems(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageItems(1, 12)).toEqual([1, 2, "gap", 12]);
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-05-10T12:00:00Z");
  it.each([
    ["2026-05-10T11:59:30Z", "just now"],
    ["2026-05-10T11:55:00Z", "5 minutes ago"],
    ["2026-05-10T09:00:00Z", "3 hours ago"],
    ["2026-05-09T12:00:00Z", "yesterday"],
    ["2026-04-28T12:00:00Z", "12 days ago"],
  ])("%s -> %s", (iso, expected) => {
    expect(formatRelative(iso, now)).toBe(expected);
  });
});
