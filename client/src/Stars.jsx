// P-031: star display and star input. Kept dumb on purpose — every score it
// renders comes from Kite's own users.
export function Stars({ value, count }) {
  if (!count) return <span className="stars-none">Not rated yet</span>;
  const full = Math.round(value);
  return (
    <span className="stars" title={`${value} from ${count} ${count === 1 ? "rating" : "ratings"}`}>
      <span className="stars-marks" aria-hidden="true">
        {"★★★★★".slice(0, full)}
        <span className="stars-dim">{"★★★★★".slice(full)}</span>
      </span>
      <span className="stars-value">{value}</span>
      <span className="stars-count">({count})</span>
    </span>
  );
}

export function StarPicker({ value, onPick, busy }) {
  return (
    <span className="star-picker" role="group" aria-label="Rate from 1 to 5 stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star-btn ${value >= n ? "on" : ""}`}
          disabled={busy}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onPick(n)}
        >
          ★
        </button>
      ))}
    </span>
  );
}
