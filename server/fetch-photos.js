// P-032: fetch one photo per attraction from Wikimedia Commons, with the
// credit CC BY-SA requires. Run it whenever new places are seeded:
//
//   npm run photos          # only places missing a photo
//   npm run photos -- --all # refetch everything
//
// Commons images may be stored and self-hosted under their licences, so we
// keep the URL and credit in our own database rather than calling Wikipedia
// on every page view.
import { db } from "./db.js";

const UA = "Kite/1.0 (trip planner; https://github.com/Talyahav17/kite)";
// Commons returns credit as HTML: drop the tags, then decode the entities so
// names read as names ("Massey & the…", not "Massey &amp; the…").
const strip = (s) =>
  (s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\[\d+\]/g, "") // stray footnote markers
    .replace(/\s+/g, " ")
    .trim();

async function wiki(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// A Wikipedia lead image is usually a photo of the place, but for institutions
// it is often the logo, and for regions a map or coat of arms. Those look
// broken in a travel app, so reject them and show nothing rather than a crest.
const NOT_A_PHOTO =
  /logo|seal|coat.?of.?arms|crest|emblem|map|flag|icon|wordmark|banner|\.svg$/i;

// Wikipedia's lead image for the article, which for a landmark is the landmark.
async function findPhoto(name, city) {
  for (const title of [`${name}`, `${name}, ${city}`, `${name} (${city})`]) {
    const q = await wiki(
      "https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&redirects=1" +
        `&pithumbsize=800&titles=${encodeURIComponent(title)}`
    );
    const page = Object.values(q?.query?.pages || {})[0];
    if (!page?.thumbnail?.source || !page?.pageimage) continue;
    if (NOT_A_PHOTO.test(page.pageimage)) {
      console.log(`  · ${name} — lead image is "${page.pageimage}", not a photo`);
      continue;
    }

    // strip Wikipedia's analytics query string — we want a clean image URL
    const url = page.thumbnail.source.split("?")[0];
    const meta = await wiki(
      "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=extmetadata&format=json" +
        `&titles=${encodeURIComponent("File:" + page.pageimage)}`
    );
    const info = Object.values(meta?.query?.pages || {})[0]?.imageinfo?.[0]?.extmetadata || {};

    return {
      url,
      artist: strip(info.Artist?.value) || "Wikimedia Commons",
      license: info.LicenseShortName?.value || "See source",
      licenseUrl: info.LicenseUrl?.value || "",
      page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.pageimage)}`,
    };
  }
  return null;
}

const all = process.argv.includes("--all");
const rows = db
  .prepare(
    `SELECT id, name, city FROM attractions ${all ? "" : "WHERE image_url IS NULL"} ORDER BY id`
  )
  .all();

if (rows.length === 0) {
  console.log("Every attraction already has a photo. Use --all to refetch.");
  process.exit(0);
}

const save = db.prepare(
  `UPDATE attractions SET image_url = ?, image_artist = ?, image_license = ?,
   image_license_url = ?, image_page = ? WHERE id = ?`
);

let found = 0;
for (const row of rows) {
  try {
    const photo = await findPhoto(row.name, row.city);
    if (photo) {
      save.run(photo.url, photo.artist, photo.license, photo.licenseUrl, photo.page, row.id);
      found++;
      console.log(`  ✓ ${row.name} — ${photo.license} · ${photo.artist}`);
    } else {
      console.log(`  · ${row.name} — no image found`);
    }
  } catch (err) {
    console.log(`  ! ${row.name} — ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 250)); // be a good citizen
}

console.log(`\n${found} of ${rows.length} attractions now have a photo.`);
