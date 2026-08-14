async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (body) => request("/api/auth/register", { method: "POST", body }),
  login: (body) => request("/api/auth/login", { method: "POST", body }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request("/api/auth/me"),

  trips: () => request("/api/trips"),
  createTrip: (body) => request("/api/trips", { method: "POST", body }),
  trip: (id) => request(`/api/trips/${id}`),
  updateTrip: (id, body) => request(`/api/trips/${id}`, { method: "PUT", body }),
  deleteTrip: (id) => request(`/api/trips/${id}`, { method: "DELETE" }),

  shareTrip: (id) => request(`/api/trips/${id}/share`, { method: "POST" }),
  unshareTrip: (id) => request(`/api/trips/${id}/share`, { method: "DELETE" }),
  sharedTrip: (token) => request(`/api/shared/${token}`),

  suggestions: (city) => request(`/api/suggestions?city=${encodeURIComponent(city)}`),
  pendingRatings: () => request("/api/ratings/pending"),
  rateAttraction: (id, body) =>
    request(`/api/attractions/${id}/rate`, { method: "POST", body }),

  createItem: (tripId, body) =>
    request(`/api/trips/${tripId}/items`, { method: "POST", body }),
  updateItem: (id, body) => request(`/api/items/${id}`, { method: "PUT", body }),
  deleteItem: (id) => request(`/api/items/${id}`, { method: "DELETE" }),
};

export const ITEM_TYPES = [
  { value: "city", label: "City", emoji: "📍" },
  { value: "attraction", label: "Attraction", emoji: "🎡" },
  { value: "hotel", label: "Hotel", emoji: "🏨" },
  { value: "transport", label: "Transport", emoji: "🚆" },
  { value: "food", label: "Food", emoji: "🍽️" },
  { value: "activity", label: "Activity", emoji: "⛰️" },
  { value: "other", label: "Note", emoji: "📝" },
];

export const typeMeta = (value) =>
  ITEM_TYPES.find((t) => t.value === value) || ITEM_TYPES[ITEM_TYPES.length - 1];
