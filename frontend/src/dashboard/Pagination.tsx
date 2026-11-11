import { pageItems } from "./pageItems";
import styles from "./Pagination.module.css";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Pagination" className={styles.pagination}>
      <p className={styles.range}>
        Showing {first}–{last} of {total}
      </p>
      {totalPages > 1 && (
        <ul className={styles.pages}>
          <li>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </button>
          </li>
          {pageItems(page, totalPages).map((item, i) =>
            item === "gap" ? (
              <li key={`gap-${i}`} aria-hidden="true">
                …
              </li>
            ) : (
              <li key={item}>
                <button
                  type="button"
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? "page" : undefined}
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </li>
        </ul>
      )}
    </nav>
  );
}
