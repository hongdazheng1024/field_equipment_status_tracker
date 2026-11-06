import { describe, expect, it } from "vitest";
import { isStale, staleCutoff } from "./rules.js";

const now = new Date("2026-11-06T12:00:00Z");
const daysAgo = (days: number, extraMs = 0) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000 - extraMs);

describe("staleCutoff", () => {
  it("is exactly 7 days before now", () => {
    expect(staleCutoff(now).toISOString()).toBe("2026-10-30T12:00:00.000Z");
  });
});

describe("isStale", () => {
  it("is false for something checked today", () => {
    expect(isStale(daysAgo(0), now)).toBe(false);
  });

  it("is false at exactly 7 days (the brief says *over* 7 days)", () => {
    expect(isStale(daysAgo(7), now)).toBe(false);
  });

  it("is true one millisecond past 7 days", () => {
    expect(isStale(daysAgo(7, 1), now)).toBe(true);
  });

  it("is true for something checked weeks ago", () => {
    expect(isStale(daysAgo(30), now)).toBe(true);
  });
});
