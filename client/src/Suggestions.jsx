// P-031: "What others rated in <city>" — suggestions drawn from Kite's own
// users' ratings, plus the prompt asking you to rate places you have been.
import { useEffect, useState } from "react";
import { api, typeMeta } from "./api.js";
import { Stars, StarPicker } from "./Stars.jsx";

// Every place this trip might touch. City items are the strongest signal, but
// a multi-city trip is usually typed into the destination field as a list
// ("France, Netherlands, Germany" / "Rome & Florence"), which as one string
// matches nothing — so split it and treat each part as a candidate too. T-007.
export function citiesOf(trip, items) {
  const fromItems = items.filter((i) => i.type === "city").map((i) => i.title);
  const fromDestination = (trip.destination || "").split(/[,/&]|\band\b|→|->/);
  return [...new Set([...fromItems, ...fromDestination].map((c) => c.trim()).filter(Boolean))];
}

export function Suggestions({ trip, items, onAdd }) {
  const candidates = citiesOf(trip, items).join("|");
  const [known, setKnown] = useState(null); // cities we actually have places for
  const [city, setCity] = useState("");
  const [list, setList] = useState(null);

  // Ask about every candidate and keep the ones that come back with places, so
  // a country ("France") silently drops out while its cities stay. T-007.
  useEffect(() => {
    const list = candidates.split("|").filter(Boolean);
    if (list.length === 0) {
      setKnown([]);
      return;
    }
    let live = true;
    Promise.all(
      list.map((c) =>
        api
          .suggestions(c)
          .then((d) => (d.suggestions.length ? c : null))
          .catch(() => null)
      )
    ).then((res) => {
      if (!live) return;
      const usable = res.filter(Boolean);
      setKnown(usable);
      setCity((current) => (usable.includes(current) ? current : usable[0] || ""));
    });
    return () => {
      live = false;
    };
  }, [candidates]);

  useEffect(() => {
    if (!city) return;
    setList(null);
    api
      .suggestions(city)
      .then((d) => setList(d.suggestions))
      .catch(() => setList([]));
  }, [city]);

  const cities = known || [];
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
      <p className="photo-credit">
        Photos from{" "}
        <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">
          Wikimedia Commons
        </a>{" "}
        — hover a photo for its photographer and licence.
      </p>

      {!list ? (
        <div className="skeleton skeleton-line" style={{ width: "60%" }} />
      ) : (
        <ul className="suggestion-list">
          {fresh.slice(0, 6).map((s) => {
            const meta = typeMeta(s.type);
            return (
              <li key={s.id} className="suggestion">
                {s.image_url ? (
                  // CC BY-SA requires the credit to travel with the image, so it
                  // lives in the title and on the link out to the source page.
                  <a
                    className="suggestion-photo"
                    href={s.image_page}
                    target="_blank"
                    rel="noreferrer"
                    title={`${s.image_artist} · ${s.image_license} (via Wikimedia Commons)`}
                  >
                    <img src={s.image_url} alt="" loading="lazy" />
                  </a>
                ) : (
                  <span className="suggestion-photo suggestion-photo-empty">
                    {meta.emoji}
                  </span>
                )}
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
