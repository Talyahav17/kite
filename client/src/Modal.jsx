// P-054: one shell for every modal, and it renders the error itself.
//
// Three separate fixes were silently useless because the modal they landed in
// had nowhere to display an error: the share modal in P-051, and both delete
// confirmations in P-053. Each time the catch was correct and the user still
// saw nothing. Handing the error to the shell means the next modal cannot
// forget, because forgetting is no longer possible.
//
// `actions` is a prop rather than part of the children so the error always
// sits directly above the buttons — the place a person looks after pressing
// one that did nothing.
import { useEffect, useRef } from "react";

// Everything a person can Tab to. :not([disabled]) matters — a disabled
// submit button is skipped by the browser, so including it would send focus
// somewhere Tab never goes.
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function Modal({
  onClose,
  error = "",
  actions = null,
  after = null,
  size = "",
  top = false,
  as: Element = "div",
  children,
  ...props
}) {
  const card = useRef(null);

  useEffect(() => {
    const node = card.current;
    const returnTo = document.activeElement;

    // offsetParent is null for anything display:none, which a hidden branch of
    // a modal can be — Tab skips those, so the trap must too.
    const reachable = () =>
      [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);

    // React has already honoured autoFocus by now; don't fight it.
    if (!node.contains(document.activeElement)) (reachable()[0] || node).focus();

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      const list = reachable();
      if (list.length === 0) return e.preventDefault();

      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // put the keyboard back where it was, or the page loses its place
      if (returnTo instanceof HTMLElement) returnTo.focus();
    };
  }, []);

  return (
    <div
      className={`modal-backdrop${top ? " modal-backdrop-top" : ""}`}
      onClick={onClose}
    >
      <Element
        ref={card}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`modal${size ? ` modal-${size}` : ""} card`}
        // a click inside must not reach the backdrop, which closes
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
        {error && <div className="form-error">{error}</div>}
        {actions && <div className="modal-actions">{actions}</div>}
        {/* below the buttons on purpose — T-005 keeps a destructive link away
            from the ones people press to dismiss */}
        {after}
      </Element>
    </div>
  );
}
