// P-046: the destination list, bundled rather than fetched.
//
// ~2 KB gzipped buys instant filtering on every keystroke, works with no
// network, and adds no third-party service to the request path. A countries
// API would be a round trip per character for data that changes once a decade.
export const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium",
  "Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei",
  "Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde",
  "Central African Republic","Chad","Chile","China","Colombia","Comoros","Costa Rica",
  "Croatia","Cuba","Cyprus","Czechia","Denmark","Djibouti","Dominica","Dominican Republic",
  "Ecuador","Egypt","El Salvador","Estonia","Eswatini","Ethiopia","Fiji","Finland","France",
  "Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea",
  "Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland",
  "Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kosovo",
  "Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein",
  "Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta",
  "Mauritania","Mauritius","Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco",
  "Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger",
  "Nigeria","North Macedonia","Norway","Oman","Pakistan","Palestine","Panama",
  "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania",
  "Rwanda","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore",
  "Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan","Spain",
  "Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan",
  "Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan",
  "Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay",
  "Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

// Cities Kite already holds places and photos for. Offered alongside countries
// because picking "Rome" rather than "Italy" gives sharper suggestions.
export const KNOWN_CITIES = [
  "Amsterdam","Barcelona","Florence","Lisbon","London","Paris","Rome","Tokyo",
];

// December in Sydney is not winter. Seasons are flipped for these.
export const SOUTHERN_HEMISPHERE = new Set([
  "Argentina","Australia","Bolivia","Botswana","Brazil","Chile","Eswatini","Fiji","Lesotho",
  "Madagascar","Malawi","Mauritius","Mozambique","Namibia","New Zealand","Papua New Guinea",
  "Paraguay","Peru","Seychelles","South Africa","Tanzania","Uruguay","Vanuatu","Zambia",
  "Zimbabwe",
]);

/**
 * Destinations matching what has been typed. Names that *start* with the query
 * come first — typing "ind" should offer India before Finland.
 */
export function searchDestinations(query, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const all = [
    ...KNOWN_CITIES.map((name) => ({ name, kind: "city" })),
    ...COUNTRIES.map((name) => ({ name, kind: "country" })),
  ];

  const starts = [];
  const contains = [];
  for (const place of all) {
    const lower = place.name.toLowerCase();
    if (lower.startsWith(q)) starts.push(place);
    else if (lower.includes(q)) contains.push(place);
  }

  return [...starts, ...contains].slice(0, limit);
}
