import type { Equipment } from "../api/types";
import { formatDateTime, formatRelative, STATUS_ICONS, STATUS_LABELS } from "./format";
import styles from "./EquipmentTable.module.css";

interface Props {
  items: Equipment[];
  /** Reference time for "3 days ago": when this data was fetched. */
  now: number;
  onEdit: (item: Equipment) => void;
}

export function EquipmentTable({ items, now, onEdit }: Props) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Site</th>
            <th scope="col">Status</th>
            <th scope="col">Last checked</th>
            <th scope="col">Stale</th>
            <th scope="col">
              <span className={styles.visuallyHidden}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={item.isStale ? styles.staleRow : undefined}>
              <td className={styles.id}>{item.id}</td>
              <th scope="row" className={styles.name}>
                {item.name}
              </th>
              <td>{item.type}</td>
              <td>{item.site.name}</td>
              <td>
                <span className={`${styles.status} ${styles[item.status]}`}>
                  <span aria-hidden="true">{STATUS_ICONS[item.status]} </span>
                  {STATUS_LABELS[item.status]}
                </span>
              </td>
              <td>
                <time dateTime={item.lastCheckedAt} title={formatDateTime(item.lastCheckedAt)}>
                  {formatRelative(item.lastCheckedAt, now)}
                </time>
                {item.lastCheckedBy && <div className={styles.by}>by {item.lastCheckedBy.displayName}</div>}
              </td>
              <td>{item.isStale ? <span className={styles.staleBadge}>Stale</span> : <span className={styles.by}>No</span>}</td>
              <td>
                <button type="button" className={styles.edit} onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
