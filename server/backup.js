// P-002 / P-014: snapshot the live SQLite database into server/backups/,
// keeping the newest 14. Uses sqlite3's online .backup so it is safe while the
// API runs. Callable as a function (the API schedules it daily) or directly:
//   npm run backup
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KEEP = 14;
const dir = path.dirname(fileURLToPath(import.meta.url));
const db = path.join(dir, "trips.db");
const backupDir = path.join(dir, "backups");

export function runBackup() {
  if (!fs.existsSync(db)) throw new Error(`No database found at ${db}`);

  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/T/, "-")
    .replace(/:/g, "")
    .slice(0, 17); // YYYY-MM-DD-HHMMSS
  const dest = path.join(backupDir, `trips-${stamp}.db`);

  execFileSync("sqlite3", [db, `.backup ${dest}`]);

  const check = execFileSync("sqlite3", [dest, "PRAGMA integrity_check;"])
    .toString()
    .trim();
  // the check opens the copy briefly and can leave empty WAL sidecars behind
  for (const ext of ["-shm", "-wal"]) fs.rmSync(dest + ext, { force: true });
  if (check !== "ok") {
    fs.rmSync(dest);
    throw new Error(`Backup failed integrity check: ${check}`);
  }

  const pruned = [];
  const all = fs
    .readdirSync(backupDir)
    .filter((f) => /^trips-.*\.db$/.test(f))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
    fs.rmSync(path.join(backupDir, old));
    pruned.push(old);
  }

  return { dest, bytes: fs.statSync(dest).size, pruned, keep: KEEP };
}

// P-014: back up on boot, then once every 24 hours while the API is running.
export function scheduleBackups(intervalMs = 24 * 60 * 60 * 1000) {
  const tick = () => {
    try {
      const { dest, bytes } = runBackup();
      console.log(`[backup] ${path.basename(dest)} (${(bytes / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`[backup] FAILED: ${err.message}`);
    }
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref(); // never hold the process open just for backups
  return timer;
}

// Direct invocation: npm run backup
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { dest, bytes, pruned, keep } = runBackup();
    for (const old of pruned) console.log(`Pruned old backup ${old}`);
    console.log(
      `Backup OK: ${dest} (${(bytes / 1024).toFixed(1)} KB, integrity ok, keeping last ${keep})`
    );
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
