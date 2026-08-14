// P-031: "What others rated in <city>" — suggestions drawn from Kite's own
// users' ratings, plus the prompt asking you to rate places you have been.
import { useEffect, useState } from "react";
import { api, typeMeta } from "./api.js";
import { Stars, StarPicker } from "./Stars.jsx";

// The cities this trip actually touches: its city items, else its destination.
export function citiesOf(trip, items) {
  const fromItems = items.filter((i) => i.type === "city").map((i) => i.title.trim());
  const unique = [...new Set(fromItems)];
  if (unique.length) return unique;
  return trip.destination ? [trip.destination.trim()] : [];
}

export function Suggestions({ trip, items, onAdd }) {
  const cities = citiesOf(trip, items);
  const [city, setCity] = useState(cities[0] || "");
  const [list, setList] = useState(null);

  useEffect(() => {
    if (!cities.includes(city) && cities.length) setCity(cities[0]);
  }, [trip.id, items.length]);

  useEffect(() => {
    if (!city) return;
    setList(null);
    api
      .suggestions(city)
      .then((d) => setList(d.suggestions))
      .catch(() => setList([]));
  }, [city]);

  if (!city) return null;
  if (list && list.length === 0) return null;

  // Don't suggest what's already planned. Matches the server's fuzzy rule:
  // "Colosseum & Forum" on the itinerary should hide the "Colosseum" suggestion.
  const planned = items.map((i) => i.title.trim().toLowerCase());
  const fresh = (list || []).filter((s) => {
    const name = s.name.toLowerCase();
    const already = planned.some((p) => p === name || p.includes(name));
    return !already && !s.your_rating;
  });
  if (list && fresh.length === 0) return null;

  return (
    <section className="card suggestions">
      <div className="suggestions-head">
        <h2>Worth seeing in {city}</h2>
        {cities.length > 1 && (
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      <p className="suggestions-sub">
        Rated by Kite travellers who have been. Add one and we’ll ask what you
        thought when you’re back.
      </p>

      {!list ? (
        <div className="skeleton skeleton-line" style={{ width: "60%" }} />
      ) : (
        <ul className="suggestion-list">
          {fresh.slice(0, 6).map((s) => {
            const meta = typeMeta(s.type);
            return (
              <li key={s.id} className="suggestion">
                <span className={`item-badge type-${s.type}`}>
                  {meta.emoji} {meta.label}
                </span>
                <span className="suggestion-name">{s.name}</span>
                <Stars value={s.avg_stars} count={s.rating_count} />
                <button
                  className="btn btn-small"
                  onClick={() => onAdd({ title: s.name, type: s.type })}
                >
                  + Add
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function RatingPrompts() {
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api
      .pendingRatings()
      .then((d) => setPending(d.pending))
      .catch(() => setPending([]));
  }, []);

  async function rate(attraction, stars) {
    setBusy(attraction.id);
    try {
      await api.rateAttraction(attraction.id, { stars });
      setPending((p) => p.filter((x) => x.id !== attraction.id));
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) return null;

  return (
    <section className="card rating-prompts">
      <h2>How was it?</h2>
      <p className="suggestions-sub">
        You’ve been to these. Your rating helps the next traveller — it’s shown
        as an average, never attached to your name.
      </p>
      <ul className="prompt-list">
        {pending.slice(0, 4).map((p) => (
          <li key={p.id} className="prompt">
            <span className="prompt-name">
              {p.name}
              <span className="prompt-where">
                {p.city} · {p.trip_title}
              </span>
            </span>
            <StarPicker busy={busy === p.id} onPick={(n) => rate(p, n)} value={0} />
          </li>
        ))}
      </ul>
    </section>
  );
}
