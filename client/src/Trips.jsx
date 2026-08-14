import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import { coverStyle } from "./covers.js";
import { useUser } from "./App.jsx";
import { RatingPrompts } from "./Suggestions.jsx";

export function fmtRange(start, end) {
  const opts = { month: "short", day: "numeric" };
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const year = e.getFullYear() !== new Date().getFullYear() ? `, ${e.getFullYear()}` : "";
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}${year}`;
}

// Formats in local time — toISOString would shift the date in timezones ahead of UTC.
function ymd(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function tripDays(start, end) {
  const days = [];
  const d = new Date(start + "T00:00:00");
  const stop = new Date(end + "T00:00:00");
  while (d <= stop && days.length < 120) {
    days.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function todayYmd() {
  return ymd(new Date());
}

// P-023: where the trip sits relative to today, so a card can say something
// live rather than just repeating its dates.
export function tripStatus(start, end) {
  const today = todayYmd();
  if (today > end) return { kind: "past", label: "Completed" };
  if (today >= start) {
    const days = tripDays(start, end);
    const n = days.indexOf(today) + 1;
    return { kind: "now", label: `Day ${n} of ${days.length} · happening now`, live: true };
  }
  const diff = Math.round(
    (new Date(start + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000
  );
  if (diff === 0) return { kind: "now", label: "Starts today", live: true };
  if (diff === 1) return { kind: "soon", label: "Tomorrow" };
  if (diff <= 30) return { kind: "soon", label: `In ${diff} days` };
  return { kind: "future", label: `In ${diff} days` };
}

// P-032: an Unsplash photo layered over the gradient when one is available.
// The gradient stays underneath, so a missing key, a failed request or a slow
// network degrades to the cover Kite already had rather than an empty box.
// Unsplash requires their photographer to be credited wherever the photo shows.
function CoverPhoto({ city }) {
  const [cover, setCover] = useState(null);

  useEffect(() => {
    let live = true;
    if (!city) return;
    api
      .cover(city)
      .then((c) => live && setCover(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [city]);

  if (!cover?.url) return null;
  return (
    <>
      <img className="trip-cover-photo" src={cover.url} alt={cover.alt} loading="lazy" />
      {/* both sources oblige us to name the photographer wherever it shows */}
      <span className="cover-credit">{cover.credit}</span>
    </>
  );
}

const EMPTY = { title: "", destination: "", start_date: "", end_date: "", notes: "" };

const FILTERS = [
  { key: "all", label: "All trips" },
  { key: "now", label: "Happening now" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
];

export default function Trips() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [trips, setTrips] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    api.trips().then((d) => setTrips(d.trips));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      const { trip } = await api.createTrip(form);
      navigate(`/trips/${trip.id}`); // P-010: land inside the new trip
    } catch (err) {
      setError(err.message);
    }
  }

  if (!trips)
    return (
      <div className="trips-page">
        <div className="page-head">
          <h1>Your trips</h1>
        </div>
        <div className="trip-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card skeleton-card">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          ))}
        </div>
      </div>
    );

  const counts = {
    all: trips.length,
    now: trips.filter((t) => tripStatus(t.start_date, t.end_date).kind === "now").length,
    upcoming: trips.filter((t) =>
      ["soon", "future"].includes(tripStatus(t.start_date, t.end_date).kind)
    ).length,
    past: trips.filter((t) => tripStatus(t.start_date, t.end_date).kind === "past").length,
  };

  const visible = trips.filter((t) => {
    const kind = tripStatus(t.start_date, t.end_date).kind;
    if (filter === "all") return true;
    if (filter === "upcoming") return kind === "soon" || kind === "future";
    return kind === filter;
  });

  const firstName = (user?.name || "").split(" ")[0];

  return (
    <div className="trips-page">
      <div className="greeting">
        <div>
          <h1>Where to next{firstName ? `, ${firstName}` : ""}?</h1>
          <p className="greeting-sub">
            {counts.now > 0
              ? "You're on a trip right now — have a good one."
              : counts.upcoming > 0
              ? `${counts.upcoming} ${counts.upcoming === 1 ? "trip" : "trips"} on the horizon.`
              : "Every trip starts with a first line in the itinerary."}
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New trip"}
        </button>
      </div>

      <RatingPrompts />

      {trips.length > 0 && (
        <div className="chip-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? "selected" : ""}`}
              onClick={() => setFilter(f.key)}
              disabled={counts[f.key] === 0 && f.key !== "all"}
            >
              {f.label}
              <span className="chip-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <form className="card trip-form" onSubmit={create}>
          <div className="form-row">
            <label>
              Trip name
              <input
                value={form.title}
                onChange={set("title")}
                placeholder="Summer in Italy"
                required
                autoFocus
              />
            </label>
            <label>
              Destination
              <input
                value={form.destination}
                onChange={set("destination")}
                placeholder="Italy"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Start date
              <input type="date" value={form.start_date} onChange={set("start_date")} required />
            </label>
            <label>
              End date
              <input type="date" value={form.end_date} onChange={set("end_date")} required />
            </label>
          </div>
          <label>
            Notes
            <textarea
              rows={2}
              value={form.notes}
              onChange={set("notes")}
              placeholder="Budget, who's coming, ideas…"
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary">Create trip</button>
        </form>
      )}

      {trips.length === 0 && !showForm && (
        <div className="empty-state">
          <div className="empty-emoji">🧳</div>
          <p>No trips yet. Create your first one and start filling in the days.</p>
        </div>
      )}

      {trips.length > 0 && visible.length === 0 && (
        <div className="empty-state">
          <p>No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} to show.</p>
        </div>
      )}

      <div className="trip-grid">
        {visible.map((t) => {
          const status = tripStatus(t.start_date, t.end_date);
          const days = tripDays(t.start_date, t.end_date).length;
          return (
            <Link key={t.id} to={`/trips/${t.id}`} className="trip-card">
              <div className="trip-cover" style={coverStyle(t.id)}>
                <CoverPhoto city={t.destination || t.title} />
                <span className={`trip-countdown on-cover ${status.kind}`}>
                  {status.live && <span className="live-dot" />}
                  {status.label}
                </span>
                <div className="trip-cover-text">
                  <div className="trip-card-title">{t.title}</div>
                  {t.destination && (
                    <div className="trip-card-dest">{t.destination}</div>
                  )}
                </div>
              </div>
              <div className="trip-card-body">
                <span className="trip-card-dates">
                  {fmtRange(t.start_date, t.end_date)}
                </span>
                <span className="trip-card-meta">
                  {days} {days === 1 ? "day" : "days"} · {t.item_count}{" "}
                  {t.item_count === 1 ? "item" : "items"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
