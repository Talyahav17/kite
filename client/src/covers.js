// P-029: every trip gets a cover. Kite has no photo library and no right to
// stock imagery, so covers are gradients picked deterministically from the
// trip name — the same trip always looks the same, and a list of trips reads
// as a set of distinct places rather than a table of rows.
const COVERS = [
  { name: "sunset", from: "#ff8a4c", to: "#d6336c", ink: "#fff" },
  { name: "ocean", from: "#38bdf8", to: "#1d4ed8", ink: "#fff" },
  { name: "forest", from: "#4ade80", to: "#15803d", ink: "#fff" },
  { name: "dusk", from: "#a78bfa", to: "#6d28d9", ink: "#fff" },
  { name: "desert", from: "#fbbf24", to: "#b45309", ink: "#fff" },
  { name: "alpine", from: "#67e8f9", to: "#0e7490", ink: "#fff" },
  { name: "bloom", from: "#f472b6", to: "#9d174d", ink: "#fff" },
  { name: "midnight", from: "#64748b", to: "#0f172a", ink: "#fff" },
];

// Keyed on the trip's id rather than a hash of its name. Ids are unique and
// never change, so a trip keeps its cover for life and trips created one after
// another always land on different covers — hashing names collided often
// enough that two cards side by side would share a colour.
export function coverFor(id) {
  return COVERS[Math.abs(Number(id) || 0) % COVERS.length];
}

export function coverStyle(id) {
  const c = coverFor(id);
  return {
    backgroundImage: `linear-gradient(135deg, ${c.from}, ${c.to})`,
    color: c.ink,
  };
}
