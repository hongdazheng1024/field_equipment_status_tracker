import type { EquipmentStatus } from "../api/types";
import { STATUS_ICONS, STATUS_LABELS } from "./format";
import styles from "./StatusBadge.module.css";

/** Status as symbol + text + color, never color alone. */
export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <span className={`${styles.status} ${styles[status]}`}>
      <span aria-hidden="true">{STATUS_ICONS[status]} </span>
      {STATUS_LABELS[status]}
    </span>
  );
}
