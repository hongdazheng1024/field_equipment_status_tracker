import { useEffect, useRef, useState } from "react";
import { STATUSES, type EquipmentStatus } from "../api/types";
import { STATUS_ICONS, STATUS_LABELS } from "./format";
import type { DashboardFilters } from "./useDashboardFilters";
import styles from "./EquipmentFilters.module.css";

export const SEARCH_DEBOUNCE_MS = 300;

interface Props {
  filters: DashboardFilters;
  types: string[];
  showClear: boolean;
  onChange: (patch: Partial<DashboardFilters>, options?: { replace?: boolean }) => void;
  onClear: () => void;
}

export function EquipmentFilters({ filters, types, showClear, onChange, onClear }: Props) {
  function toggleStatus(status: EquipmentStatus) {
    const statuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ statuses });
  }

  return (
    <section aria-label="Filters" className={styles.filters}>
      <SearchBox value={filters.q} onSearch={(q) => onChange({ q }, { replace: true })} />

      <label className={styles.field}>
        Type
        <select value={filters.type ?? ""} onChange={(e) => onChange({ type: e.target.value || undefined })}>
          <option value="">All types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <div role="group" aria-label="Status" className={styles.chips}>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={styles.chip}
            aria-pressed={filters.statuses.includes(status)}
            onClick={() => toggleStatus(status)}
          >
            <span aria-hidden="true">{STATUS_ICONS[status]} </span>
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      <label className={styles.checkbox}>
        <input type="checkbox" checked={filters.stale} onChange={(e) => onChange({ stale: e.target.checked })} />
        Stale only
      </label>

      {showClear && (
        <button type="button" className={styles.clear} onClick={onClear}>
          Clear filters
        </button>
      )}
    </section>
  );
}

/**
 * Search input that only reports a value once typing pauses, so the list isn't
 * refetched on every keystroke. Keeps its own text while typing, and resets it
 * when the URL changes from elsewhere (e.g. "Clear filters" or Back).
 */
function SearchBox({ value, onSearch }: { value: string; onSearch: (q: string) => void }) {
  const [text, setText] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // Adjusting state during render: React's recommended way to sync from a prop.
    setLastValue(value);
    setText(value);
  }

  // The parent passes a new onSearch each render; keep the latest in a ref so a
  // re-render (e.g. a refetch finishing) doesn't restart the timer.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === value) return;
    const timer = setTimeout(() => onSearchRef.current(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value]);

  return (
    <label className={`${styles.field} ${styles.search}`}>
      Search
      <input
        type="search"
        placeholder="Name or type"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </label>
  );
}
