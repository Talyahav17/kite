// P-031: a small curated starter set so suggestions aren't empty on day one.
//
// These are place NAMES and cities only — plain facts. No ratings, review text
// or scores are copied from anyone: every score Kite ever shows is computed
// from its own users' ratings. That is deliberate, and it is what keeps this
// feature free of third-party licence terms.
// Trips are often labelled by country ("France, Netherlands, Germany") rather
// than city, so each city carries its country and suggestions match either.
export const CITY_COUNTRY = {
  Rome: "Italy",
  Florence: "Italy",
  Lisbon: "Portugal",
  Paris: "France",
  Barcelona: "Spain",
  Tokyo: "Japan",
  London: "United Kingdom",
  Amsterdam: "Netherlands",
};

export const SEED_ATTRACTIONS = [
  // Rome
  ["Colosseum", "Rome", "attraction"],
  ["Pantheon", "Rome", "attraction"],
  ["Trevi Fountain", "Rome", "attraction"],
  ["Vatican Museums", "Rome", "attraction"],
  ["Trastevere", "Rome", "activity"],
  ["Testaccio Market", "Rome", "food"],

  // Florence
  ["Uffizi Gallery", "Florence", "attraction"],
  ["Duomo di Firenze", "Florence", "attraction"],
  ["Ponte Vecchio", "Florence", "attraction"],
  ["Boboli Gardens", "Florence", "activity"],
  ["Mercato Centrale", "Florence", "food"],

  // Lisbon
  ["Belém Tower", "Lisbon", "attraction"],
  ["Jerónimos Monastery", "Lisbon", "attraction"],
  ["Alfama", "Lisbon", "activity"],
  ["Tram 28", "Lisbon", "activity"],
  ["Time Out Market", "Lisbon", "food"],
  ["Pastéis de Belém", "Lisbon", "food"],

  // Paris
  ["Eiffel Tower", "Paris", "attraction"],
  ["Louvre Museum", "Paris", "attraction"],
  ["Musée d'Orsay", "Paris", "attraction"],
  ["Montmartre", "Paris", "activity"],
  ["Marché des Enfants Rouges", "Paris", "food"],

  // Barcelona
  ["Sagrada Família", "Barcelona", "attraction"],
  ["Park Güell", "Barcelona", "attraction"],
  ["Casa Batlló", "Barcelona", "attraction"],
  ["Gothic Quarter", "Barcelona", "activity"],
  ["La Boqueria", "Barcelona", "food"],

  // Tokyo
  ["Senso-ji", "Tokyo", "attraction"],
  ["Meiji Jingu", "Tokyo", "attraction"],
  ["teamLab Planets", "Tokyo", "attraction"],
  ["Shibuya Crossing", "Tokyo", "activity"],
  ["Tsukiji Outer Market", "Tokyo", "food"],

  // London
  ["British Museum", "London", "attraction"],
  ["Tower of London", "London", "attraction"],
  ["Tate Modern", "London", "attraction"],
  ["Borough Market", "London", "food"],
  ["Hampstead Heath", "London", "activity"],

  // Amsterdam
  ["Rijksmuseum", "Amsterdam", "attraction"],
  ["Van Gogh Museum", "Amsterdam", "attraction"],
  ["Anne Frank House", "Amsterdam", "attraction"],
  ["Jordaan", "Amsterdam", "activity"],
];
