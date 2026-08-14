// P-032: city/trip cover photos from Unsplash.
//
// Unsplash's API terms differ from Wikimedia's in a way that shapes this file:
// their images must be HOTLINKED, never downloaded or re-hosted, every display
// must credit the photographer with a link back, and using a photo must ping
// their download endpoint. So unlike attraction photos we cache only the URL
// and credit — briefly — and never the bytes.
//
// Inactive without UNSPLASH_ACCESS_KEY: /api/cover simply reports unavailable
// and the client keeps its gradient covers. Get a free key at
// https://unsplash.com/developers and put it in server/.env.
const KEY = () => process.env.UNSPLASH_ACCESS_KEY?.trim();
const TTL = 24 * 60 * 60 * 1000; // re-query at most daily per city
const cache = new Map(); // city -> { at, cover }

export const coversEnabled = () => Boolean(KEY());

export async function cityCover(city) {
  const key = KEY();
  if (!key) return null;

  const hit = cache.get(city.toLowerCase());
  if (hit && Date.now() - hit.at < TTL) return hit.cover;

  const res = await fetch(
    "https://api.unsplash.com/search/photos?per_page=1&orientation=landscape" +
      `&query=${encodeURIComponent(city + " travel")}`,
    { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } }
  );
  if (!res.ok) throw new Error(`Unsplash ${res.status}`);

  const photo = (await res.json())?.results?.[0];
  if (!photo) return null;

  const cover = {
    url: photo.urls?.regular, // hotlinked, never stored
    alt: photo.alt_description || city,
    photographer: photo.user?.name,
    photographer_url: `${photo.user?.links?.html}?utm_source=kite&utm_medium=referral`,
    unsplash_url: "https://unsplash.com/?utm_source=kite&utm_medium=referral",
    download_location: photo.links?.download_location,
  };
  cache.set(city.toLowerCase(), { at: Date.now(), cover });
  return cover;
}

// Unsplash requires this ping when a photo is actually used, so photographers
// get credited with the download. Fire-and-forget; never block the user on it.
export function noteUsed(downloadLocation) {
  const key = KEY();
  if (!key || !downloadLocation) return;
  fetch(downloadLocation, { headers: { Authorization: `Client-ID ${key}` } }).catch(
    () => {}
  );
}
