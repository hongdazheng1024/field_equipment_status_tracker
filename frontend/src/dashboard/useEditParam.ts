import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { positiveInt } from "./useDashboardFilters";

/**
 * The open edit panel lives in the URL as ?edit=<id>, next to the filters, so
 * a reload reopens it and Back closes it.
 */
export function useEditParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = positiveInt(searchParams.get("edit"));

  const openEdit = useCallback(
    (id: number) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("edit", String(id));
        return next;
      });
    },
    [setSearchParams],
  );

  // replace: closing shouldn't leave an entry that Back would reopen.
  const closeEdit = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("edit");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { editId, openEdit, closeEdit };
}
