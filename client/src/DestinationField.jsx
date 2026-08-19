// P-046: destination with suggestions as you type.
//
// Filtering happens locally against a bundled list, so it keeps up with typing
// and works offline. Keyboard driven throughout — arrow keys, Enter, Escape —
// because a picker that only works with a mouse is worse than a plain field
// for anyone filling a form quickly.
import { useEffect, useId, useRef, useState } from "react";
import { searchDestinations } from "./lib/countries.js";

export default function DestinationField({
  value,
  onChange,
  onCommit = () => {},
  placeholder = "Italy",
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [matches, setMatches] = useState([]);
  const wrap = useRef(null);
  const listId = useId();

  useEffect(() => {
    setMatches(searchDestinations(value));
    setActive(0);
  }, [value]);

  // Clicking anywhere else should dismiss the list, not leave it hanging.
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const visible = open && matches.length > 0;

  function choose(name) {
    onChange(name);
    onCommit(name);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!visible) {
      if (e.key === "ArrowDown" && matches.length) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      // only swallow Enter when a suggestion is actually highlighted, so the
      // form still submits normally otherwise
      e.preventDefault();
      choose(matches[active].name);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="destination-field" ref={wrap}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // half-typed text is not a destination, so anything that depends on it
        // waits until the field is finished with
        onBlur={() => onCommit(value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={visible ? `${listId}-${active}` : undefined}
      />

      {visible && (
        <ul className="destination-list" id={listId} role="listbox">
          {matches.map((place, i) => (
            <li
              key={`${place.kind}-${place.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`destination-option ${i === active ? "active" : ""}`}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: blur would close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(place.name);
              }}
            >
              <span>{place.name}</span>
              {place.kind === "city" && <span className="destination-tag">city</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
