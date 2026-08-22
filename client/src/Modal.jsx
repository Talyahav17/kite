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
  return (
    <div
      className={`modal-backdrop${top ? " modal-backdrop-top" : ""}`}
      onClick={onClose}
    >
      <Element
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
