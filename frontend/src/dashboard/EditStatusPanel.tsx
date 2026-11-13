import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { newChangeId } from "../api/changeId";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { errorMessage } from "../api/errorMessage";
import { STATUSES, type Equipment, type EquipmentStatus } from "../api/types";
import { SidePanel } from "../components/SidePanel";
import { formatDateTime, formatRelative, STATUS_LABELS } from "./format";
import { StatusBadge } from "./StatusBadge";
import { StatusHistory } from "./StatusHistory";
import panelForm from "../components/PanelForm.module.css";
import styles from "./EditStatusPanel.module.css";

export const REASON_MAX = 500; // matches the API's limit (characters)

interface Props {
  equipmentId: number;
  /** The table row, shown straight away while the latest copy loads. */
  initial?: Equipment;
  onClose: () => void;
  onSaved: (message: string) => void;
}

type StatusChangeBody = Parameters<typeof api.changeStatus>[1];

export function EditStatusPanel({ equipmentId, initial, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  // Reference time for "3 days ago" in the panel: when it opened.
  const [now] = useState(() => Date.now());

  const itemQuery = useQuery({
    queryKey: ["equipment", "detail", equipmentId],
    queryFn: ({ signal }) => api.getEquipment(equipmentId, signal).then((r) => r.data),
    placeholderData: initial,
  });

  // `base` is the copy of the item this edit is based on; its version is what
  // gets sent. It follows fresh data until the user starts editing, then stays
  // fixed, so a change by someone else shows up as a conflict, not silently.
  const [base, setBase] = useState<Equipment | null>(null);
  const [status, setStatus] = useState<EquipmentStatus | null>(null);
  const [reason, setReason] = useState("");
  const [changeId, setChangeId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Equipment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  const dirty = reason.trim() !== "" || (base !== null && status !== base.status);
  const latest = itemQuery.data;
  if (latest && (!base || (!dirty && latest.version !== base.version))) {
    // Adjusting state during render (React's pattern for syncing from new data).
    setBase(latest);
    setStatus(latest.status);
  }

  const mutation = useMutation({
    mutationFn: (body: StatusChangeBody) => api.changeStatus(equipmentId, body),
    onSuccess: ({ data }) => {
      // One prefix refreshes the table, this item and its history; sites refreshes the cards and badges.
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
      const { equipment, change } = data;
      onSaved(
        change.oldStatus === change.newStatus
          ? `${equipment.name}: ${STATUS_LABELS[change.newStatus]} confirmed.`
          : `${equipment.name} marked ${STATUS_LABELS[change.newStatus]}.`,
      );
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) setChangeId(null); // nothing was written
      const current = err instanceof ApiError ? (err.details as { current?: Equipment } | undefined)?.current : undefined;
      if (err instanceof ApiError && err.status === 409 && current) {
        // Someone else saved first. Show what they did, switch to their version,
        // and keep what this user typed so they can decide and resubmit.
        setConflict(current);
        setBase(current);
        queryClient.setQueryData(["equipment", "detail", equipmentId], current);
        void queryClient.invalidateQueries({ queryKey: ["equipment", "history", equipmentId] });
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setRemoved(true);
        void queryClient.invalidateQueries({ queryKey: ["equipment"] }); // drop it from the table
        void queryClient.invalidateQueries({ queryKey: ["sites"] });
      }
      // Network errors keep the changeId: if the save did reach the server, the
      // retry is recognised and not applied twice.
      setError(errorMessage(err));
    },
  });

  function requestClose() {
    if (mutation.isPending) return; // let the save finish
    if (dirty && !window.confirm("Discard your changes?")) return;
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!base || !status || !reason.trim() || mutation.isPending) return;
    const id = changeId ?? newChangeId();
    setChangeId(id);
    setError(null);
    setConflict(null);
    mutation.mutate({ status, reason: reason.trim(), version: base.version, changeId: id });
  }

  // Any edit after a failed attempt is a new change, so it gets a new id.
  function edited() {
    setChangeId(null);
    setError(null);
  }

  const loadFailed = !base && itemQuery.isError;
  const canSubmit = !!base && !!status && reason.trim() !== "" && !mutation.isPending && !removed;
  const submitLabel = mutation.isPending
    ? "Saving…"
    : status && status === base?.status
      ? `Confirm ${STATUS_LABELS[status]}`
      : "Save status";

  return (
    <SidePanel
      title={base?.name ?? `Equipment ${equipmentId}`}
      subtitle={base && `${base.type} · ${base.site.name}`}
      onRequestClose={requestClose}
      footer={
        <>
          <button type="button" className={panelForm.secondary} onClick={requestClose} disabled={mutation.isPending}>
            Cancel
          </button>
          {!loadFailed && (
            <button type="submit" form="edit-status-form" className={panelForm.primary} disabled={!canSubmit}>
              {mutation.isPending && <span className={panelForm.spinner} aria-hidden="true" />}
              {submitLabel}
            </button>
          )}
        </>
      }
    >
      {loadFailed && (
        <p role="alert" className={panelForm.error}>
          Couldn't load this equipment. {errorMessage(itemQuery.error)}
        </p>
      )}
      {!base && !loadFailed && <p className={panelForm.muted}>Loading…</p>}

      {base && status && (
        <>
          <dl className={styles.current}>
            <div>
              <dt>Current status</dt>
              <dd>
                <StatusBadge status={base.status} />
                {base.isStale && <span className={styles.stale}>Stale</span>}
              </dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>
                <time dateTime={base.lastCheckedAt} title={formatDateTime(base.lastCheckedAt)}>
                  {formatRelative(base.lastCheckedAt, now)}
                </time>
                {base.lastCheckedBy && ` by ${base.lastCheckedBy.displayName}`}
              </dd>
            </div>
          </dl>

          {conflict && (
            <div role="alert" className={styles.conflict}>
              <strong>{conflict.lastCheckedBy?.displayName ?? "Someone else"} updated this item while you were editing.</strong>{" "}
              It's now {STATUS_LABELS[conflict.status]}. Your entries are kept: review them and submit again.
            </div>
          )}
          {error && (
            <p role="alert" className={panelForm.error}>
              {removed ? "This equipment has been removed, so its status can't be changed." : error}
            </p>
          )}

          <form id="edit-status-form" className={panelForm.form} onSubmit={handleSubmit} noValidate>
            <fieldset disabled={mutation.isPending || removed} className={panelForm.fieldset}>
              <label className={panelForm.field}>
                New status
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as EquipmentStatus);
                    edited();
                  }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                      {s === base.status ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {status === base.status && (
                <p className={panelForm.hint}>Keeping the same status records a check and resets “last checked”.</p>
              )}

              <label className={panelForm.field}>
                <span>
                  Reason <span className={panelForm.required}>(required)</span>
                </span>
                <textarea
                  rows={4}
                  maxLength={REASON_MAX}
                  required
                  aria-describedby="reason-count"
                  placeholder="What did you see or do?"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    edited();
                  }}
                />
              </label>
              <p id="reason-count" className={styles.count}>
                {reason.length} / {REASON_MAX} characters
              </p>
            </fieldset>
          </form>

          <StatusHistory equipmentId={equipmentId} now={now} />
        </>
      )}
    </SidePanel>
  );
}
