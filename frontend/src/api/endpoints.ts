import { apiFetch } from "./client";
import type {
  AuthUser,
  Equipment,
  EquipmentQuery,
  EquipmentStatus,
  Paginated,
  SiteSummary,
  StatusChange,
} from "./types";

// One typed function per backend endpoint. Components and hooks call these,
// never fetch() directly.

export const api = {
  login: (username: string, password: string) =>
    apiFetch<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: { username, password },
    }),

  me: () => apiFetch<{ user: AuthUser }>("/auth/me"),

  getSites: (signal?: AbortSignal) =>
    apiFetch<{ data: SiteSummary[]; types: string[] }>("/sites", { signal }),

  listEquipment: (query: EquipmentQuery, signal?: AbortSignal) =>
    apiFetch<Paginated<Equipment>>("/equipment", { query: { ...query }, signal }),

  getEquipment: (id: number, signal?: AbortSignal) =>
    apiFetch<{ data: Equipment }>(`/equipment/${id}`, { signal }),

  getHistory: (id: number, page = 1, signal?: AbortSignal) =>
    apiFetch<Paginated<StatusChange>>(`/equipment/${id}/status-changes`, { query: { page }, signal }),

  changeStatus: (
    id: number,
    body: { status: EquipmentStatus; reason: string; version: number; changeId?: string },
  ) =>
    apiFetch<{ data: { equipment: Equipment; change: StatusChange } }>(`/equipment/${id}/status-changes`, {
      method: "POST",
      body,
    }),

  createEquipment: (body: { name: string; type: string; siteId: number; status: EquipmentStatus }) =>
    apiFetch<{ data: Equipment }>("/equipment", { method: "POST", body }),

  deleteEquipment: (id: number, version: number) =>
    apiFetch<void>(`/equipment/${id}`, { method: "DELETE", query: { version } }),
};
