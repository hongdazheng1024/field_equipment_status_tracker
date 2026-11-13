import { useQuery } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { formatDateTime, formatRelative, STATUS_LABELS } from "./format";
import styles from "./StatusHistory.module.css";

/** The brief's per-item history: who, when, old -> new status, and why. Newest first. */
export function StatusHistory({ equipmentId, now }: { equipmentId: number; now: number }) {
  const history = useQuery({
    queryKey: ["equipment", "history", equipmentId],
    queryFn: ({ signal }) => api.getHistory(equipmentId, 1, signal),
  });

  return (
    <section aria-labelledby="history-title" className={styles.history}>
      <h3 id="history-title" className={styles.title}>
        Change history
      </h3>

      {history.isPending && <p className={styles.muted}>Loading history…</p>}
      {history.isError && (
        <p className={styles.muted}>
          Couldn't load history. {history.error.message}{" "}
          <button type="button" className={styles.link} onClick={() => void history.refetch()}>
            Retry
          </button>
        </p>
      )}
      {history.data && history.data.data.length === 0 && <p className={styles.muted}>No changes recorded yet.</p>}

      {history.data && history.data.data.length > 0 && (
        <>
          <ol className={styles.list}>
            {history.data.data.map((change) => (
              <li key={change.id} className={styles.entry}>
                <div className={styles.meta}>
                  <time dateTime={change.changedAt} title={formatDateTime(change.changedAt)}>
                    {formatRelative(change.changedAt, now)}
                  </time>{" "}
                  · {change.user.displayName}
                </div>
                <div className={styles.change}>
                  {change.oldStatus === change.newStatus
                    ? `Confirmed ${STATUS_LABELS[change.newStatus]}`
                    : `${STATUS_LABELS[change.oldStatus]} → ${STATUS_LABELS[change.newStatus]}`}
                </div>
                <p className={styles.reason}>{change.reason}</p>
              </li>
            ))}
          </ol>
          {history.data.total > history.data.data.length && (
            <p className={styles.muted}>
              Showing the latest {history.data.data.length} of {history.data.total} changes.
            </p>
          )}
        </>
      )}
    </section>
  );
}
