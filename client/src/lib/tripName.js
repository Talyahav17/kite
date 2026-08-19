// P-046: propose a name for a trip from what the traveller has already told us.
//
// The rules are ordered by how much they actually know about the trip. What is
// written in the notes beats the season, because "Honeymoon in Greece" says
// more than "Summer in Greece"; a long weekend beats a season for the same
// reason. Everything falls back to something plainly true rather than clever.
import { SOUTHERN_HEMISPHERE } from "./countries.js";
import { tripDays } from "./dates.js";

// Phrases people actually write in a trip note, and what the trip then is.
const OCCASIONS = [
  [/\bhoneymoon\b/i, "Honeymoon"],
  [/\banniversar/i, "Anniversary"],
  [/\bbirthday\b/i, "Birthday"],
  [/\bwedding\b/i, "Wedding"],
  [/\b(business|work|conference|client|meeting)\b/i, "Business trip"],
  [/\b(family|kids|children|parents)\b/i, "Family trip"],
  [/\broad ?trip\b/i, "Road trip"],
  [/\b(hike|hiking|trek|trekking|camping)\b/i, "Hiking trip"],
  [/\bski(ing)?\b/i, "Ski trip"],
  [/\b(surf|surfing|diving|scuba)\b/i, "Surf trip"],
];

const SEASONS = ["Winter", "Spring", "Summer", "Autumn"];

/** Meteorological season for a month, flipped below the equator. */
export function seasonOf(month, destination = "") {
  // 0-based month → 0 winter (Dec–Feb), 1 spring, 2 summer, 3 autumn
  const northern = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][month];
  const south = SOUTHERN_HEMISPHERE.has(destination.trim());
  return SEASONS[south ? (northern + 2) % 4 : northern];
}

/**
 * A concise name, or "" when there is not enough to say anything useful.
 * Never invents a destination — with nowhere to go there is nothing to name.
 */
export function suggestTripName({ destination = "", start_date = "", end_date = "", notes = "" } = {}) {
  const place = destination.trim().replace(/\s+/g, " ");
  if (!place) return "";

  // "Rome, Florence" → "Rome" reads better than the whole list in a title
  const shortPlace = place.split(/[,/&]|\band\b|→|->/)[0].trim() || place;

  for (const [pattern, occasion] of OCCASIONS) {
    if (pattern.test(notes)) {
      const preposition = occasion.endsWith("trip") ? "to" : "in";
      return `${occasion} ${preposition} ${shortPlace}`;
    }
  }

  if (!start_date) return `Trip to ${shortPlace}`;

  const start = new Date(start_date + "T00:00:00");
  if (Number.isNaN(start.getTime())) return `Trip to ${shortPlace}`;

  const nights = end_date ? Math.max(tripDays(start_date, end_date).length - 1, 0) : 0;
  const endsOnWeekend = end_date && [0, 5, 6].includes(new Date(end_date + "T00:00:00").getDay());

  // A short break that touches a weekend is a weekend away, whatever the season
  if (end_date && nights >= 1 && nights <= 3 && (endsOnWeekend || [4, 5, 6].includes(start.getDay())))
    return `Weekend in ${shortPlace}`;

  return `${seasonOf(start.getMonth(), shortPlace)} in ${shortPlace}`;
}
