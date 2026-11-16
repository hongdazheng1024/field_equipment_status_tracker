import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { newChangeId } from "../api/changeId";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { errorMessage } from "../api/errorMessage";
import { STATUSES, type Equipment, type EquipmentStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
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
  /** After a delete (or finding it already deleted). The panel closes itself too. */
  onDeleted: (message: string) => void;
}

type StatusChangeBody = Parameters<typeof api.changeStatus>[1];

/** Someone else changed the item first; `during` is what this user was trying to do. */
interface Conflict {
  current: Equipment;
  during: "save" | "delete";
}

/** The latest copy of the item that a 409 response carries, if any. */
function conflictCurrent(err: unknown): Equipment | undefined {
  if (!(err instanceof ApiError) || err.status !== 409) return undefined;
  return (err.details as { current?: Equipment } | undefined)?.current;
}

export function EditStatusPanel({ equipmentId, initial, onClose, onSaved, onDeleted }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canDelete = user?.role === "SUPERVISOR"; // the API rejects anyone else with 403
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
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  // Delete is two steps: the Delete button swaps the footer for a confirmation.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty = reason.trim() !== "" || (base !== null && status !== base.status);
  const latest = itemQuery.data;
  if (latest && (!base || (!dirty && latest.version !== base.version))) {
    // Adjusting state during render (React's pattern for syncing from new data).
    setBase(latest);
    setStatus(latest.status);
  }

  /** Someone else saved first: show what they did and switch to their version. */
  function handleConflict(current: Equipment, during: Conflict["during"]) {
    setConflict({ current, during });
    setBase(current);
    queryClient.setQueryData(["equipment", "detail", equipmentId], current);
    void queryClient.invalidateQueries({ queryKey: ["equipment", "history", equipmentId] });
  }

  /** The item is gone (deleted here or elsewhere): refresh the table and counts. */
  function forgetItem() {
    // Skip this item's own detail and history: the panel is still mounted for
    // one more render, and refetching them would only fetch a 404. (Removing
    // them instead doesn't help: the mounted queries would recreate and fetch.)
    // React Query drops them from the cache a few minutes after the panel unmounts.
    void queryClient.invalidateQueries({
      queryKey: ["equipment"],
      predicate: ({ queryKey }) =>
        !((queryKey[1] === "detail" || queryKey[1] === "history") && queryKey[2] === equipmentId),
    });
    void queryClient.invalidateQueries({ queryKey: ["sites"] });
  }

  const saveMutation = useMutation({
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
      const current = conflictCurrent(err);
      if (current) {
        // Keep what this user typed so they can decide and resubmit.
        handleConflict(current, "save");
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

  const deleteMutation = useMutation({
    mutationFn: (version: number) => api.deleteEquipment(equipmentId, version),
    onSuccess: () => {
      forgetItem();
      onDeleted(`Deleted ${base?.name ?? `equipment ${equipmentId}`}.`);
      onClose();
    },
    onError: (err) => {
      const current = conflictCurrent(err);
      if (current) {
        // Changed since the supervisor looked: show the new state and make them confirm again.
        setConfirmingDelete(false);
        handleConflict(current, "delete");
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        // Someone else deleted it first: the outcome this user wanted anyway.
        forgetItem();
        onDeleted(`${base?.name ?? `Equipment ${equipmentId}`} was already removed.`);
        onClose();
        return;
      }
      // Network error, 403, 500: stay on the confirmation so Delete can be retried.
      setError(errorMessage(err));
    },
  });

  const busy = saveMutation.isPending || deleteMutation.isPending;

  // Move focus with the footer swap: to "Keep it" when the confirmation opens
  // (the safe choice, so a stray Enter doesn't delete), back to Delete when it closes.
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmWasOpen = useRef(false);
  useEffect(() => {
    if (confirmingDelete) keepRef.current?.focus();
    else if (confirmWasOpen.current) deleteRef.current?.focus();
    confirmWasOpen.current = confirmingDelete;
  }, [confirmingDelete]);

  function requestClose() {
    if (busy) return; // let the save or delete finish
    if (confirmingDelete) {
      // Escape or a backdrop click backs out of the confirmation first.
      setConfirmingDelete(false);
      return;
    }
    if (dirty && !window.confirm("Discard your changes?")) return;
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!base || !status || !reason.trim() || busy || confirmingDelete) return;
    const id = changeId ?? newChangeId();
    setChangeId(id);
    setError(null);
    setConflict(null);
    saveMutation.mutate({ status, reason: reason.trim(), version: base.version, changeId: id });
  }

  function startDelete() {
    setError(null);
    setConflict(null);
    setConfirmingDelete(true);
  }

  function confirmDelete() {
    if (!base || busy) return;
    setError(null);
    deleteMutation.mutate(base.version);
  }

  // Any edit after a failed attempt is a new change, so it gets a new id.
  function edited() {
    setChangeId(null);
    setError(null);
  }

  const loadFailed = !base && itemQuery.isError;
  const canSubmit = !!base && !!status && reason.trim() !== "" && !busy && !removed;
  const submitLabel = saveMutation.isPending
    ? "Saving…"
    : status && status === base?.status
      ? `Confirm ${STATUS_LABELS[status]}`
      : "Save status";

  const footer =
    confirmingDelete && base ? (
      <div className={styles.confirmDelete} role="group" aria-labelledby="delete-confirm-text">
        <p id="delete-confirm-text">
          <strong>Delete {base.name}?</strong> It disappears from the dashboard; its history is kept.
        </p>
        <div className={styles.confirmButtons}>
          <button
            ref={keepRef}
            type="button"
            className={panelForm.secondary}
            onClick={() => setConfirmingDelete(false)}
            disabled={deleteMutation.isPending}
          >
            Keep it
          </button>
          <button type="button" className={styles.danger} onClick={confirmDelete} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending && <span className={panelForm.spinner} aria-hidden="true" />}
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    ) : (
      <>
        {canDelete && base && !removed && (
          <button ref={deleteRef} type="button" className={styles.deleteButton} onClick={startDelete} disabled={busy}>
            Delete
          </button>
        )}
        <button type="button" className={panelForm.secondary} onClick={requestClose} disabled={busy}>
          Cancel
        </button>
        {!loadFailed && (
          <button type="submit" form="edit-status-form" className={panelForm.primary} disabled={!canSubmit}>
            {saveMutation.isPending && <span className={panelForm.spinner} aria-hidden="true" />}
            {submitLabel}
          </button>
        )}
      </>
    );

  return (
    <SidePanel
      title={base?.name ?? `Equipment ${equipmentId}`}
      subtitle={base && `${base.type} · ${base.site.name}`}
      onRequestClose={requestClose}
      footer={footer}
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
              <strong>
                {conflict.current.lastCheckedBy?.displayName ?? "Someone else"} updated this item while you were{" "}
                {conflict.during === "save" ? "editing" : "deciding"}.
              </strong>{" "}
              It's now {STATUS_LABELS[conflict.current.status]}.{" "}
              {conflict.during === "save"
                ? "Your entries are kept: review them and submit again."
                : "Nothing was deleted. Check the change, then delete again if you still want to."}
            </div>
          )}
          {error && (
            <p role="alert" className={panelForm.error}>
              {removed ? "This equipment has been removed, so its status can't be changed." : error}
            </p>
          )}

          <form id="edit-status-form" className={panelForm.form} onSubmit={handleSubmit} noValidate>
            <fieldset disabled={busy || removed || confirmingDelete} className={panelForm.fieldset}>
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
