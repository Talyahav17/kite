import { useState } from "react";
import { api } from "./api.js";
import { useUser } from "./App.jsx";

export default function Auth() {
  const { setUser } = useUser();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const call = mode === "login" ? api.login(form) : api.register(form);
      const { user } = await call;
      setUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="auth-sub">Your next trip is in the air.</p>
        <form onSubmit={submit}>
          {mode === "register" && (
            <label>
              Name
              <input value={form.name} onChange={set("name")} required autoFocus />
            </label>
          )}
          <label>
            Email
            <input type="email" value={form.email} onChange={set("email")} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={set("password")}
              minLength={mode === "register" ? 8 : undefined}
              required
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>
        <button
          className="btn-link"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
