import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/endpoints";
import type { Equipment, EquipmentQuery } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { EditStatusPanel } from "../dashboard/EditStatusPanel";
import { EquipmentFilters } from "../dashboard/EquipmentFilters";
import { EquipmentTable } from "../dashboard/EquipmentTable";
import { Pagination } from "../dashboard/Pagination";
import { SiteSidebar } from "../dashboard/SiteSidebar";
import { StatCards } from "../dashboard/StatCards";
import { summarize } from "../dashboard/summary";
import {
  hasActiveFilters,
  useDashboardFilters,
  type DashboardFilters,
} from "../dashboard/useDashboardFilters";
import { useEditParam } from "../dashboard/useEditParam";
import styles from "./DashboardPage.module.css";

export const PAGE_SIZE = 20;

const CLEARED: Partial<DashboardFilters> = {
  statuses: [],
  stale: false,
  type: undefined,
  q: "",
};

/**
 * Data flow: URL filters -> two queries -> components.
 * - GET /api/sites: sidebar, stat card numbers and the type dropdown.
 * - GET /api/equipment: one page of the table, filtered on the server.
 * React Query owns the fetched data (loading/error state, caching, and
 * ignoring out-of-order responses), so nothing is copied into useState.
 */
export function DashboardPage() {
  const { user, logout } = useAuth();
  const { filters, updateFilters } = useDashboardFilters();
  const { editId, openEdit, closeEdit } = useEditParam();
  // Confirmation after a save, read out by screen readers via role="status".
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: ({ signal }) => api.getSites(signal),
  });

  const equipmentQuery: EquipmentQuery = {
    siteId: filters.siteId,
    status: filters.statuses.length ? filters.statuses : undefined,
    stale: filters.stale || undefined, // stale=false would mean "fresh only", not "any"
    type: filters.type,
    q: filters.q || undefined,
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const listQuery = useQuery({
    queryKey: ["equipment", equipmentQuery],
    // Stamp each response with its fetch time: "3 days ago" and "Updated 10:32"
    // are relative to it. (React Query's dataUpdatedAt is 0 for placeholder data.)
    queryFn: async ({ signal }) => ({
      ...(await api.listEquipment(equipmentQuery, signal)),
      fetchedAt: Date.now(),
    }),
    // Keep showing the current page while the next one loads, instead of flashing empty.
    placeholderData: keepPreviousData,
  });

  const sites = sitesQuery.data?.data;
  const summary = useMemo(
    () => (sites ? summarize(sites, filters.siteId) : undefined),
    [sites, filters.siteId],
  );
  const selectedSite = sites?.find((s) => s.id === filters.siteId);
  const list = listQuery.data;

  function handleEdit(item: Equipment) {
    setNotice(null);
    openEdit(item.id);
  }

  function refresh() {
    void sitesQuery.refetch();
    void listQuery.refetch();
  }

  let content;
  if (listQuery.isPending) {
    content = (
      <p role="status" className={styles.message}>
        Loading equipment…
      </p>
    );
  } else if (!list) {
    content = (
      <div role="alert" className={styles.error}>
        <p>Couldn't load equipment. {listQuery.error?.message}</p>
        <button type="button" onClick={() => void listQuery.refetch()}>
          Retry
        </button>
      </div>
    );
  } else if (list.data.length === 0) {
    content = (
      <div className={styles.message}>
        <p>No equipment matches these filters.</p>
        {hasActiveFilters(filters) && (
          <button type="button" onClick={() => updateFilters(CLEARED)}>
            Clear filters
          </button>
        )}
      </div>
    );
  } else {
    content = (
      <>
        {listQuery.isError && (
          <p role="alert" className={styles.error}>
            Couldn't refresh: {listQuery.error.message} Showing the last loaded
            data.
          </p>
        )}
        <EquipmentTable
          items={list.data}
          now={list.fetchedAt}
          onEdit={handleEdit}
        />
        <Pagination
          page={list.page}
          pageSize={list.pageSize}
          total={list.total}
          onPageChange={(page) => updateFilters({ page })}
        />
      </>
    );
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.appName}>Field Equipment Tracker</h1>
        <div className={styles.account}>
          <span>{user?.displayName}</span>
          <span className={styles.role}>
            {user?.role === "SUPERVISOR" ? "Supervisor" : "Operator"}
          </span>
          <button
            type="button"
            className={styles.logout}
            onClick={() => logout()}
          >
            Log out
          </button>
        </div>
      </header>

      <SiteSidebar
        sites={sites}
        selectedSiteId={filters.siteId}
        isLoading={sitesQuery.isPending}
        error={sitesQuery.error}
        onSelect={(siteId) => updateFilters({ siteId })}
        onRetry={() => void sitesQuery.refetch()}
      />

      <main className={styles.main}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>
            {filters.siteId
              ? (selectedSite?.name ?? "Unknown site")
              : "All sites"}
          </h2>
          <div className={styles.updated}>
            <span>
              {listQuery.isFetching
                ? "Updating…"
                : list &&
                  `Updated ${new Date(list.fetchedAt).toLocaleTimeString()}`}
            </span>
            <button
              type="button"
              className={styles.refresh}
              onClick={refresh}
              disabled={listQuery.isFetching}
            >
              Refresh
            </button>
          </div>
        </div>

        <StatCards
          summary={summary}
          statuses={filters.statuses}
          stale={filters.stale}
          onShowAll={() => updateFilters({ statuses: [], stale: false })}
          onSelectStatus={(status) => {
            const alreadyOnly =
              filters.statuses.length === 1 &&
              filters.statuses[0] === status &&
              !filters.stale;
            updateFilters({
              statuses: alreadyOnly ? [] : [status],
              stale: false,
            });
          }}
          onSelectStale={() => {
            const alreadyOnly = filters.stale && !filters.statuses.length;
            updateFilters({ statuses: [], stale: !alreadyOnly });
          }}
        />

        <EquipmentFilters
          filters={filters}
          types={sitesQuery.data?.types ?? []}
          showClear={hasActiveFilters(filters)}
          onChange={updateFilters}
          onClear={() => updateFilters(CLEARED)}
        />

        <p role="status" className={notice ? styles.notice : undefined}>
          {notice}
        </p>

        {content}
      </main>

      {/* Mounted only while ?edit=<id> is in the URL. key: a different item gets a fresh form. */}
      {editId !== undefined && (
        <EditStatusPanel
          key={editId}
          equipmentId={editId}
          initial={list?.data.find((item) => item.id === editId)}
          onClose={closeEdit}
          onSaved={setNotice}
        />
      )}
    </div>
  );
}
