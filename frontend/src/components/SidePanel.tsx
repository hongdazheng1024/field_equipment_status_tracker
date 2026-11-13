import { useEffect, useRef, type ReactNode } from "react";
import styles from "./SidePanel.module.css";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Called for the close button, Escape and a click on the dimmed backdrop. The parent decides whether to close. */
  onRequestClose: () => void;
}

/**
 * Slide-over panel on the right, built on the native <dialog> with showModal():
 * the browser makes the rest of the page inert (no clicks, no Tab), draws the
 * backdrop, and keeps focus inside. Mounted only while open; the parent
 * unmounts it to close.
 */
export function SidePanel({ title, subtitle, footer, children, onRequestClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Read the latest handler from a ref so the effects below run once per open.
  const onRequestCloseRef = useRef(onRequestClose);
  useEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;

    dialog.showModal();
    // A modal dialog doesn't stop the page behind it from scrolling.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      if (dialog.open) dialog.close();
      // Back to the button that opened the panel, if it's still on the page.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.panel}
      aria-labelledby="side-panel-title"
      // Escape: stop the browser closing it, and let the parent decide (e.g. confirm discarding).
      onCancel={(event) => {
        event.preventDefault();
        onRequestCloseRef.current();
      }}
      // The backdrop belongs to the <dialog> itself; the content fills an inner
      // element, so a click whose target is the dialog was on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onRequestCloseRef.current();
      }}
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <h2 id="side-panel-title" className={styles.title}>
              {title}
            </h2>
            {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Close panel"
            onClick={() => onRequestCloseRef.current()}
          >
            ✕
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}
