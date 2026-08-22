// P-053. Deliberately narrow: this is not a style linter, and it is not here
// to have opinions about semicolons. It enforces one thing — that a promise
// in UI code cannot reject into silence — because that single mistake has now
// reached main three times (T-010, P-051, P-052).
import asyncHandlerNeedsCatch from "./tools/eslint-rules/async-handler-needs-catch.js";

const kite = { rules: { "async-handler-needs-catch": asyncHandlerNeedsCatch } };

export default [
  {
    // Client source only. The server has an error middleware that catches what
    // escapes a route; the browser has nothing above the click handler.
    files: ["client/src/**/*.{js,jsx}"],
    // api.js is the transport layer: throwing is its contract and every caller
    // is expected to catch. Linting it would mean demanding it swallow the
    // errors the rest of this rule exists to make sure reach someone.
    ignores: ["client/src/api.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { kite },
    rules: { "kite/async-handler-needs-catch": "error" },
  },
];
