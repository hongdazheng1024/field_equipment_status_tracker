import type { EquipmentStatus } from "../api/types";

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  OPERATIONAL: "Operational",
  DEGRADED: "Degraded",
  DOWN: "Down",
  IN_MAINTENANCE: "In maintenance",
};

// Status is never shown by color alone: every badge has a symbol and text too.
export const STATUS_ICONS: Record<EquipmentStatus, string> = {
  OPERATIONAL: "✓",
  DEGRADED: "!",
  DOWN: "✕",
  IN_MAINTENANCE: "⚙",
};

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

/** "just now", "5 minutes ago", "yesterday", "12 days ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}

export function formatDateTime(iso: string): string {
  return absolute.format(new Date(iso));
}
