import { useEffect, useState } from "react";
import { api } from "./api.js";
import { useUser } from "./App.jsx";
import SkyPanel from "./SkyPanel.jsx";
import KiteLogo from "./KiteLogo.jsx";

// Google's mark, drawn rather than loaded — their brand guidelines require the
// official colours, and an <img> from their CDN would be one more thing that
// can fail on a slow connection.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.05-1.2-.16-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}

export default function Auth() {
  const { setUser } = useUser();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({});

  // Ask what is actually configured — a "Continue with Google" button that
  // fails when pressed is worse than no button at all.
  useEffect(() => {
    api
      .providers()
      .then(setProviders)
      .catch(() => setProviders({}));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const isLogin = mode === "login";

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { user } = await (isLogin ? api.login(form) : api.register(form));
      setUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-split">
      <aside className="auth-art">
        <SkyPanel />
        <div className="auth-art-copy">
          <div className="auth-art-brand">
            <KiteLogo height={54} variant="reverse" />
          </div>
          <h2>Your next trip is in the air.</h2>
          <p>
            Every day, city, hotel and train in one itinerary — with what it all
            costs, before you go.
          </p>
        </div>
      </aside>

      <main className="auth-form-side">
        <div className="auth-card">
          <h1>{isLogin ? "Sign in to Kite." : "Create your Kite account."}</h1>
          <p className="auth-sub">
            {isLogin ? "New here? " : "Already have an account? "}
            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode(isLogin ? "register" : "login");
                setError("");
              }}
            >
              {isLogin ? "Create an account" : "Sign in"}
            </button>
          </p>

          {providers.google && (
            <>
              {/* a full page navigation, not fetch — OAuth redirects the browser */}
              <a className="btn btn-block btn-lg btn-social" href="/api/auth/google">
                <GoogleMark /> Continue with Google
              </a>
              <div className="auth-divider">
                <span>or</span>
              </div>
            </>
          )}

          <form onSubmit={submit}>
            {!isLogin && (
              <label>
                Name
                <input value={form.name} onChange={set("name")} required autoFocus />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="you@example.com"
                required
                autoFocus={isLogin}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder={isLogin ? "" : "At least 8 characters"}
                minLength={isLogin ? undefined : 8}
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
              {busy ? "One moment…" : isLogin ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
