import { STATUSES, type EquipmentStatus } from "../api/types";
import { STATUS_ICONS, STATUS_LABELS } from "./format";
import type { StatusSummary } from "./summary";
import styles from "./StatCards.module.css";

interface Props {
  summary: StatusSummary | undefined;
  statuses: EquipmentStatus[];
  stale: boolean;
  onShowAll: () => void;
  onSelectStatus: (status: EquipmentStatus) => void;
  onSelectStale: () => void;
}

const STATUS_CLASS: Record<EquipmentStatus, string | undefined> = {
  OPERATIONAL: styles.operational,
  DEGRADED: styles.degraded,
  DOWN: styles.down,
  IN_MAINTENANCE: styles.maintenance,
};

/**
 * One card per status plus Total and Stale. Each card is a shortcut that
 * replaces the status/stale filter (the chips and "Stale only" checkbox below
 * allow combinations). A card is "pressed" when the filter is exactly that
 * card; aria-pressed tells screen readers which one is active.
 */
export function StatCards({ summary, statuses, stale, onShowAll, onSelectStatus, onSelectStale }: Props) {
  const value = (n: number | undefined) => (summary ? n : "–");

  return (
    <section aria-label="Status summary" className={styles.cards}>
      <Card label="Total" value={value(summary?.total)} pressed={!statuses.length && !stale} onClick={onShowAll} />
      {STATUSES.map((status) => (
        <Card
          key={status}
          label={STATUS_LABELS[status]}
          icon={STATUS_ICONS[status]}
          className={STATUS_CLASS[status]}
          value={value(summary?.counts[status])}
          pressed={statuses.length === 1 && statuses[0] === status && !stale}
          onClick={() => onSelectStatus(status)}
        />
      ))}
      <Card
        label="Stale (7+ days)"
        icon="⏱"
        className={styles.stale}
        value={value(summary?.staleCount)}
        pressed={stale && !statuses.length}
        onClick={onSelectStale}
      />
    </section>
  );
}

function Card(props: {
  label: string;
  value: number | string | undefined;
  icon?: string;
  className?: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.card} ${props.className ?? ""}`}
      aria-pressed={props.pressed}
      onClick={props.onClick}
    >
      <span className={styles.label}>
        {props.icon && <span aria-hidden="true">{props.icon} </span>}
        {props.label}
      </span>
      <span className={styles.value}>{props.value}</span>
    </button>
  );
}
