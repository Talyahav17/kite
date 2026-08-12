import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "./api.js";

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

const EMPTY = { title: "", destination: "", start_date: "", end_date: "", notes: "" };

export default function Trips() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
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

  if (!trips) return <div className="page-loading">Loading trips…</div>;

  return (
    <div className="trips-page">
      <div className="page-head">
        <h1>Your trips</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New trip"}
        </button>
      </div>

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

      <div className="trip-grid">
        {trips.map((t) => (
          <Link key={t.id} to={`/trips/${t.id}`} className="card trip-card">
            <div className="trip-card-title">{t.title}</div>
            {t.destination && <div className="trip-card-dest">📍 {t.destination}</div>}
            <div className="trip-card-dates">{fmtRange(t.start_date, t.end_date)}</div>
            <div className="trip-card-meta">
              {tripDays(t.start_date, t.end_date).length} days · {t.item_count}{" "}
              {t.item_count === 1 ? "item" : "items"} planned
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
