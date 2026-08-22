// P-058. "3 days · 1 items" reached the public shared view — the one page Kite
// shows people who never chose to use it — because the count and the word were
// written out by hand at every call site, and two of them forgot the check.
//
// Irregular plurals pass their own: plural(n, "city", "cities").
export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
