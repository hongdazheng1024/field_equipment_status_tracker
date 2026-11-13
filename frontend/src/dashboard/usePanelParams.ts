import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { positiveInt } from "./useDashboardFilters";

/**
 * The open side panel lives in the URL next to the filters (?edit=<id> or
 * ?create=1), so a reload reopens it and Back closes it. One panel at a time:
 * opening one replaces the other.
 */
export function usePanelParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = positiveInt(searchParams.get("edit"));
  const creating = editId === undefined && searchParams.get("create") === "1";

  const open = useCallback(
    (key: "edit" | "create", value: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete("edit");
        next.delete("create");
        next.set(key, value);
        return next;
      });
    },
    [setSearchParams],
  );

  // replace: closing shouldn't leave an entry that Back would reopen.
  const closePanel = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("edit");
        next.delete("create");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const openEdit = useCallback((id: number) => open("edit", String(id)), [open]);
  const openCreate = useCallback(() => open("create", "1"), [open]);

  return { editId, creating, openEdit, openCreate, closePanel };
}
