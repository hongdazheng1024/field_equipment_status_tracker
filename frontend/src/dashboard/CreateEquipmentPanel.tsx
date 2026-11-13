import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/endpoints";
import { errorMessage } from "../api/errorMessage";
import { STATUSES, type EquipmentStatus } from "../api/types";
import { SidePanel } from "../components/SidePanel";
import panelForm from "../components/PanelForm.module.css";
import { STATUS_LABELS } from "./format";

// Match the API's limits (characters), so nothing typed here gets rejected for length.
export const NAME_MAX = 100;
export const TYPE_MAX = 50;

const DEFAULT_STATUS: EquipmentStatus = "OPERATIONAL";

interface Props {
  /** Preselected site, e.g. the one picked in the sidebar. */
  defaultSiteId?: number;
  onClose: () => void;
  onCreated: (message: string) => void;
}

type CreateEquipmentBody = Parameters<typeof api.createEquipment>[0];

/** Supervisor only: add a piece of equipment to a site. */
export function CreateEquipmentPanel({ defaultSiteId, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const initialSite = defaultSiteId ? String(defaultSiteId) : "";
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  // A string, like the <select> value: "" means no site picked yet.
  const [siteId, setSiteId] = useState(initialSite);
  const [status, setStatus] = useState<EquipmentStatus>(DEFAULT_STATUS);
  const [error, setError] = useState<string | null>(null);

  // Same key and same response as the dashboard's query, so it shares that
  // cache entry (usually already loaded) instead of storing a second shape.
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: ({ signal }) => api.getSites(signal),
  });
  const sites = sitesQuery.data?.data;
  const types = sitesQuery.data?.types ?? [];

  const mutation = useMutation({
    mutationFn: (body: CreateEquipmentBody) => api.createEquipment(body),
    onSuccess: ({ data }) => {
      // The new item can land on any page of the table and changes the site counts.
      void queryClient.invalidateQueries({ queryKey: ["equipment"] });
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
      onCreated(`Added ${data.name} (${data.type}) to ${data.site.name}.`);
      onClose();
    },
    // Validation (e.g. a site deleted meanwhile), 403, 500 and network errors all show here.
    onError: (err) => setError(errorMessage(err)),
  });

  // Anything the user would lose by closing: asks before discarding.
  const dirty =
    name.trim() !== "" || type.trim() !== "" || siteId !== initialSite || status !== DEFAULT_STATUS;
  const siteKnown = !!sites?.some((s) => String(s.id) === siteId);
  const complete = name.trim() !== "" && type.trim() !== "" && siteKnown;
  const canSubmit = complete && !mutation.isPending;

  function requestClose() {
    if (mutation.isPending) return; // let the save finish
    if (dirty && !window.confirm("Discard this new equipment?")) return;
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);
    mutation.mutate({ name: name.trim(), type: type.trim(), siteId: Number(siteId), status });
  }

  // An edit after a failed attempt hides the old error.
  function edited() {
    setError(null);
  }

  return (
    <SidePanel
      title="Add equipment"
      onRequestClose={requestClose}
      footer={
        <>
          <button type="button" className={panelForm.secondary} onClick={requestClose} disabled={mutation.isPending}>
            Cancel
          </button>
          {sites && (
            <button type="submit" form="create-equipment-form" className={panelForm.primary} disabled={!canSubmit}>
              {mutation.isPending && <span className={panelForm.spinner} aria-hidden="true" />}
              {mutation.isPending ? "Adding…" : "Add equipment"}
            </button>
          )}
        </>
      }
    >
      {sitesQuery.isPending && <p className={panelForm.muted}>Loading sites…</p>}
      {!sites && sitesQuery.isError && (
        <div role="alert" className={panelForm.error}>
          <p>Couldn't load sites. {errorMessage(sitesQuery.error)}</p>
          <button type="button" className={panelForm.secondary} onClick={() => void sitesQuery.refetch()}>
            Retry
          </button>
        </div>
      )}

      {sites && (
        <>
          {error && (
            <p role="alert" className={panelForm.error}>
              {error}
            </p>
          )}

          {/* noValidate: the submit button stays disabled until the form is complete. */}
          <form id="create-equipment-form" className={panelForm.form} onSubmit={handleSubmit} noValidate>
            <fieldset disabled={mutation.isPending} className={panelForm.fieldset}>
              <label className={panelForm.field}>
                <span>
                  Name <span className={panelForm.required}>(required)</span>
                </span>
                <input
                  value={name}
                  maxLength={NAME_MAX}
                  required
                  autoComplete="off"
                  onChange={(e) => {
                    setName(e.target.value);
                    edited();
                  }}
                />
              </label>

              <label className={panelForm.field}>
                <span>
                  Type <span className={panelForm.required}>(required)</span>
                </span>
                {/* Suggests existing types (so "Pump" isn't added again as "pump"), still allows a new one. */}
                <input
                  value={type}
                  maxLength={TYPE_MAX}
                  required
                  autoComplete="off"
                  list="equipment-types"
                  onChange={(e) => {
                    setType(e.target.value);
                    edited();
                  }}
                />
                <datalist id="equipment-types">
                  {types.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </label>

              <label className={panelForm.field}>
                <span>
                  Site <span className={panelForm.required}>(required)</span>
                </span>
                <select
                  value={siteKnown ? siteId : ""}
                  required
                  onChange={(e) => {
                    setSiteId(e.target.value);
                    edited();
                  }}
                >
                  <option value="" disabled>
                    Select a site
                  </option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={panelForm.field}>
                Status
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
                    </option>
                  ))}
                </select>
              </label>
              <p className={panelForm.hint}>New equipment starts as checked just now.</p>
            </fieldset>
          </form>
        </>
      )}
    </SidePanel>
  );
}
