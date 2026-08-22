// Ordering and place-matching rules, kept apart from the components so they
// can be tested directly. Both fixed real bugs: T-006 (a moved item stayed out
// of order until reload) and T-007 (multi-city trips got no suggestions).

/**
 * The server's item order, mirrored on the client. Local edits replace an
 * element in place, so without re-sorting a moved item sits wherever it was
 * until the next fetch — that was T-006.
 */
export function sortItems(list) {
  const untimed = (i) => (i.time ? 0 : 1);
  return [...list].sort(
    (a, b) =>
      (a.date === null) - (b.date === null) ||
      (a.date || "").localeCompare(b.date || "") ||
      // T-002: an empty time string sorts first by default, which put a note
      // with no time above a 07:00 flight. Untimed belongs at the end of its
      // day. Must match ITEMS_ORDER on the server, or the order changes on
      // reload — that was T-006.
      untimed(a) - untimed(b) ||
      (a.time || "").localeCompare(b.time || "") ||
      a.id - b.id
  );
}

/**
 * Every place a trip might touch. City items are the strongest signal, but a
 * multi-city trip is usually typed into the destination as a list
 * ("France, Netherlands, Germany"), which as one string matches nothing —
 * that was T-007.
 */
export function citiesOf(trip, items) {
  const fromItems = (items || []).filter((i) => i.type === "city").map((i) => i.title);
  const fromDestination = (trip?.destination || "").split(/[,/&]|\band\b|→|->/);
  return [
    ...new Set([...fromItems, ...fromDestination].map((c) => c.trim()).filter(Boolean)),
  ];
}
