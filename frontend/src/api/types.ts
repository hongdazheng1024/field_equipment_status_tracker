// Response shapes from the backend API (see the API table in README.md).
// Dates arrive as ISO strings in JSON.

export const STATUSES = ["OPERATIONAL", "DEGRADED", "DOWN", "IN_MAINTENANCE"] as const;
export type EquipmentStatus = (typeof STATUSES)[number];

export type Role = "OPERATOR" | "SUPERVISOR";

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export interface Equipment {
  id: number;
  name: string;
  type: string;
  site: { id: number; name: string };
  status: EquipmentStatus;
  lastCheckedAt: string;
  lastCheckedBy: { id: number; displayName: string } | null;
  isStale: boolean;
  version: number;
}

export interface SiteSummary {
  id: number;
  name: string;
  total: number;
  staleCount: number;
  counts: Record<EquipmentStatus, number>;
}

export interface StatusChange {
  id: string;
  equipmentId: number;
  changedAt: string;
  oldStatus: EquipmentStatus;
  newStatus: EquipmentStatus;
  reason: string;
  user: { id: number; displayName: string };
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface EquipmentQuery {
  q?: string;
  siteId?: number;
  type?: string;
  status?: EquipmentStatus[];
  stale?: boolean;
  sort?: "name" | "lastCheckedAt" | "status" | "site";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
