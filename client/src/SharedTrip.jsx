// Public read-only view of a shared trip (P-018). No account required.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api.js";
import { fmtRange, tripDays } from "./Trips.jsx";
import { BudgetCard, DayRoute, ItemRow, fmtDay } from "./Itinerary.jsx";
import { plural } from "./lib/plural.js";

export default function SharedTrip() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .sharedTrip(token)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  const days = useMemo(
    () => (data ? tripDays(data.trip.start_date, data.trip.end_date) : []),
    [data]
  );

  const byDay = useMemo(() => {
    const map = new Map();
    for (const it of data?.items || []) {
      const key = it.date || "unscheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    }
    return map;
  }, [data]);

  if (error)
    return (
      <div className="empty-state">
        <div className="empty-emoji">🪁</div>
        <p>{error}</p>
        <Link to="/">Plan your own trip with Kite</Link>
      </div>
    );
  if (!data) return <div className="page-loading">Loading itinerary…</div>;

  const { trip, items } = data;
  const unscheduled = byDay.get("unscheduled") || [];

  return (
    <div className="trip-detail">
      <div className="shared-banner">Shared itinerary · view only</div>

      <div className="trip-head card">
        <div>
          <h1>{trip.title}</h1>
          <div className="trip-head-sub">
            {trip.destination && <span>📍 {trip.destination}</span>}
            <span>🗓 {fmtRange(trip.start_date, trip.end_date)}</span>
            <span>
              {plural(days.length, "day")} · {plural(items.length, "item")}
            </span>
          </div>
          {trip.notes && <p className="trip-notes">{trip.notes}</p>}
        </div>
      </div>

      {items.some((i) => i.cost) && (
        <BudgetCard items={items} days={days} budget={trip.budget} />
      )}

      <div className="days">
        {days.map((date, i) => {
          const dayItems = byDay.get(date) || [];
          const cities = dayItems.filter((it) => it.type === "city");
          return (
            <section key={date} className="day card">
              <div className="day-head">
                <div>
                  <span className="day-num">Day {i + 1}</span>
                  <span className="day-date">{fmtDay(date)}</span>
                  {cities.length > 0 && (
                    <span className="day-cities">
                      {cities.map((c) => c.title).join(" → ")}
                    </span>
                  )}
                </div>
              </div>
              {/* T-011: an empty day used to vanish, so a link-holder could not
                  tell "not planned yet" from "the trip ends here" from "the
                  rest didn't load" — while the header still said 5 days. */}
              {dayItems.length === 0 ? (
                <p className="day-empty day-empty-static">Nothing planned for this day.</p>
              ) : (
                <>
                  <DayRoute items={dayItems} />
                  <ul className="item-list">
                    {dayItems.map((it) => (
                      <ItemRow key={it.id} item={it} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}

        {unscheduled.length > 0 && (
          <section className="day card">
            <div className="day-head">
              <div>
                <span className="day-num">Anytime</span>
                <span className="day-date">Not tied to a specific day</span>
              </div>
            </div>
            <ul className="item-list">
              {unscheduled.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="shared-footer">
        Planned with <Link to="/">Kite</Link> — your next trip is in the air.
      </div>
    </div>
  );
}
