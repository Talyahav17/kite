import { useState } from "react";
import { api } from "./api.js";
import { useUser } from "./App.jsx";
import SkyPanel from "./SkyPanel.jsx";
import KiteLogo from "./KiteLogo.jsx";

export default function Auth() {
  const { setUser } = useUser();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
            <KiteLogo size={30} /> Kite
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
