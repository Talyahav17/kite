// P-047: propose a plan for each day of a trip.
//
// Everything here comes from places Kite actually holds — nothing is invented.
// That matters more in a travel app than anywhere else: a made-up restaurant
// is not a wrong answer on a screen, it is somebody standing outside a door
// that was never there.
//
// Hotels are absent on purpose. Kite has no hotel data, so a plan anchors to
// the hotel already on the itinerary if there is one, and otherwise says
// plainly that it does not know where you are staying.
/**
 * Every calendar day of the trip. Dates are plain strings throughout — parsing
 * them into instants is what shifted every day by one in T-001.
 */
export function tripDays(start, end) {
  const days = [];
  const d = new Date(start + "T00:00:00");
  const stop = new Date(end + "T00:00:00");
  while (d <= stop && days.length < 120) {
    const pad = (n) => String(n).padStart(2, "0");
    days.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const SLOTS = [
  { time: "09:30", want: ["attraction"], label: "morning" },
  { time: "13:00", want: ["food"], label: "lunch" },
  { time: "15:30", want: ["activity", "attraction"], label: "afternoon" },
];

/** Best first: rated places above unrated, then more ratings, then by name. */
export function rank(a, b) {
  const aRated = a.rating_count > 0;
  const bRated = b.rating_count > 0;
  if (aRated !== bRated) return aRated ? -1 : 1;
  if (aRated && a.avg_stars !== b.avg_stars) return b.avg_stars - a.avg_stars;
  if (a.rating_count !== b.rating_count) return b.rating_count - a.rating_count;
  return a.name.localeCompare(b.name);
}

/** Matches the fuzzy rule used elsewhere: "Colosseum & Forum" covers "Colosseum". */
function alreadyPlanned(name, planned) {
  const lower = name.toLowerCase();
  return planned.some((p) => p === lower || p.includes(lower));
}

/**
 * @param days        calendar days of the trip, in order
 * @param cityForDay  date -> city, where the itinerary says which city
 * @param places      candidate places, already restricted to the trip's cities
 * @param planned     titles already on the itinerary, lowercased
 * @param hotel       the traveller's own hotel item, if they added one
 */
export function buildPlan({ days, cityForDay = {}, places = [], planned = [], hotel = null }) {
  const used = new Set();
  const cities = [...new Set(places.map((p) => p.city))];

  const available = places
    .filter((p) => !alreadyPlanned(p.name, planned))
    .sort(rank);

  return days.map((date, index) => {
    // Follow the itinerary's own city for the day; otherwise spread the trip
    // evenly across whatever cities it covers rather than parking in the first.
    const city =
      cityForDay[date] ||
      cities[Math.floor((index * cities.length) / Math.max(days.length, 1))] ||
      cities[0] ||
      null;

    const items = [];
    for (const slot of SLOTS) {
      // `want` is a preference order, not a set: the afternoon prefers
      // something to do and only falls back to another sight if there is
      // nothing. Treating it as a set gives two museums and a wasted evening.
      let pick = null;
      for (const type of slot.want) {
        pick = available.find(
          (p) =>
            !used.has(p.id) &&
            p.type === type &&
            (!city || p.city.toLowerCase() === String(city).toLowerCase())
        );
        if (pick) break;
      }
      if (!pick) continue; // a slot with nothing worth suggesting stays empty

      used.add(pick.id);
      items.push({
        attraction_id: pick.id,
        title: pick.name,
        type: pick.type,
        time: slot.time,
        slot: slot.label,
        location: pick.city,
        avg_stars: pick.avg_stars,
        rating_count: pick.rating_count,
        image_url: pick.image_url || null,
      });
    }

    return {
      date,
      city,
      items,
      // said once per day so the gap is visible rather than quietly filled
      hotel: hotel ? { title: hotel.title, location: hotel.location || "" } : null,
    };
  });
}

/** A short, honest account of what the plan does and does not cover. */
export function planSummary(plan, { hotel }) {
  const suggested = plan.reduce((n, day) => n + day.items.length, 0);
  const emptyDays = plan.filter((d) => d.items.length === 0).length;

  const notes = [];
  if (!hotel)
    notes.push(
      "Kite doesn't know where you're staying — add a hotel and it will anchor each day to it."
    );
  if (emptyDays)
    notes.push(
      `${emptyDays} ${emptyDays === 1 ? "day has" : "days have"} nothing left to suggest — Kite only knows a handful of places in each city so far.`
    );

  return { suggested, empty_days: emptyDays, notes };
}
