// P-050: end-to-end tests.
//
// The render smoke tests (client/test/render.test.js) say plainly what they do
// not cover: effects never run, so nothing that happens once data arrives is
// tested, and nothing clicks. T-010 lived in exactly that gap — a lapsed
// session left the trips page loading for ever, and 91 tests saw nothing.
//
// These run the real thing: one server, a real browser, a throwaway database.
import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
// Done here rather than in globalSetup: Playwright starts the web server
// first, and the server cannot open a database in a directory that is not
// there yet. Wiping it each run means a test can assert "no trips yet" and a
// row left over from yesterday cannot fail a passing test.
const dataDir = path.join(root, "e2e", ".tmp");
const PORT = 4300;

// KITE_E2E_BASE_URL points the suite at an already-running deployment instead
// of the throwaway one below — a tunnel, a staging box, the real thing. The
// local server is then neither started nor wanted, so webServer is dropped.
const external = process.env.KITE_E2E_BASE_URL?.replace(/\/$/, "");
const baseURL = external || `http://127.0.0.1:${PORT}`;

if (!external) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
}

export default defineConfig({
  testDir: "./e2e",
  // A shared database means one spec's trips show up in another's list, so the
  // specs run one at a time. There are few enough that this stays quick.
  workers: 1,
  fullyParallel: false,
  // A test that only passes on the third go is a broken test.
  retries: 0,
  // The same reporters either way, so a CI failure leaves behind the same
  // report and trace you would get locally.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Against an external deployment there is nothing to start, and starting one
  // would quietly test the wrong thing.
  webServer: external
    ? undefined
    : {
        // The build lives here, not in the npm script, so that `npx playwright
        // test` cannot quietly run against a stale client/dist. It can: it did,
        // and a sabotaged component still passed every test until the rebuild.
        command: "npm run build --prefix client && node server/index.js",
        cwd: root,
        url: `${baseURL}/healthz`,
        reuseExistingServer: false,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          PORT: String(PORT),
          HOST: "127.0.0.1",
          // Serve the built client from the API process, the way production does,
          // without production's Secure cookie — which a browser would refuse to
          // send back over plain http, making sign-in impossible.
          KITE_SERVE_CLIENT: "1",
          KITE_DB: path.join(dataDir, "e2e.db"),
          JWT_SECRET: "end-to-end-tests-only-not-a-real-secret",
          // A run creates far more accounts and sign-ins than a person would.
          KITE_REGISTER_LIMIT: "500",
          KITE_LOGIN_LIMIT: "500",
        },
      },
});
