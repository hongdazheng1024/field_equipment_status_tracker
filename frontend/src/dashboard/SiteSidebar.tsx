import type { SiteSummary } from "../api/types";
import styles from "./SiteSidebar.module.css";

interface Props {
  sites: SiteSummary[] | undefined;
  selectedSiteId?: number;
  isLoading: boolean;
  error: Error | null;
  onSelect: (siteId: number | undefined) => void;
  onRetry: () => void;
}

/** Site list with a "down" count badge, so a problem site stands out without opening it. */
export function SiteSidebar({ sites, selectedSiteId, isLoading, error, onSelect, onRetry }: Props) {
  const totalDown = sites?.reduce((sum, s) => sum + s.counts.DOWN, 0) ?? 0;

  return (
    <nav className={styles.sidebar} aria-label="Sites">
      <h2 className={styles.title}>Sites</h2>

      {isLoading && <p className={styles.muted}>Loading sites…</p>}
      {error && !sites && (
        <div role="alert" className={styles.error}>
          <p>Couldn't load sites. {error.message}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {sites && (
        <ul className={styles.list}>
          <SiteItem label="All sites" down={totalDown} selected={selectedSiteId === undefined} onClick={() => onSelect(undefined)} />
          {sites.map((site) => (
            <SiteItem
              key={site.id}
              label={site.name}
              down={site.counts.DOWN}
              selected={site.id === selectedSiteId}
              onClick={() => onSelect(site.id)}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}

function SiteItem(props: { label: string; down: number; selected: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        className={styles.item}
        aria-current={props.selected ? "page" : undefined}
        onClick={props.onClick}
      >
        <span>{props.label}</span>
        {props.down > 0 && (
          <span className={styles.badge} aria-label={`${props.down} down`}>
            {props.down}
          </span>
        )}
      </button>
    </li>
  );
}
