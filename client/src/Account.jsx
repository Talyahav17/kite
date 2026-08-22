// P-056 (T-008): the page where you can leave.
//
// Deletion is irreversible and takes the trips with it, so it says exactly
// what will go before asking, and asks for the password again — a borrowed
// session should not be enough. Accounts created through Google have no
// password to give, so they confirm by typing their address.
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "./api.js";
import { useUser } from "./App.jsx";
import Modal from "./Modal.jsx";

export default function Account() {
  const { user, setUser } = useUser();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const byPassword = user?.has_password !== false;

  async function remove(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.deleteAccount(byPassword ? { password } : { confirmEmail });
      // the cookie is already cleared server-side; drop the local user too
      setUser(null);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // P-059: leaving should not have to mean losing it all.
  async function download() {
    setError("");
    setDownloading(true);
    try {
      const blob = await api.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `kite-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  function open() {
    setPassword("");
    setConfirmEmail("");
    setError("");
    setConfirming(true);
  }

  return (
    <div className="account-page">
      <Link to="/" className="back-link">
        ← All trips
      </Link>

      <h1>Your account</h1>

      <div className="card account-card">
        <div className="account-row">
          <span className="account-label">Name</span>
          <span>{user.name}</span>
        </div>
        <div className="account-row">
          <span className="account-label">Email</span>
          <span>{user.email}</span>
        </div>
      </div>

      <div className="card account-card">
        <h2>Your data</h2>
        <p>
          Every trip, everything in them, and the ratings you have given — as
          one JSON file you keep.
        </p>
        <button className="btn" onClick={download} disabled={downloading}>
          {downloading ? "Preparing…" : "Download my trips"}
        </button>
        {error && !confirming && <div className="form-error">{error}</div>}
      </div>

      <div className="card account-card account-danger">
        <h2>Delete your account</h2>
        <p>
          This removes your account, every trip and everything in it, and the
          ratings you have given. Any share links you have sent stop working.
          It cannot be undone.
        </p>
        <button className="btn btn-danger-solid" onClick={open}>
          Delete my account
        </button>
      </div>

      {confirming && (
        <Modal
          as="form"
          size="small"
          error={error}
          onClose={() => setConfirming(false)}
          onSubmit={remove}
          actions={
            <>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirming(false)}
              >
                Keep my account
              </button>
              <button className="btn btn-danger-solid" disabled={busy}>
                {busy ? "Deleting…" : "Delete for ever"}
              </button>
            </>
          }
        >
          <h2>Delete “{user.email}”?</h2>
          <p className="confirm-text">
            Everything goes: your trips, everything in them, your ratings, and
            any link you have shared. There is no undo and no copy kept. If
            you want your itineraries, close this and download them first.
          </p>
          {byPassword ? (
            <label>
              Enter your password to confirm
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </label>
          ) : (
            <label>
              Type <strong>{user.email}</strong> to confirm
              <input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                autoFocus
                required
              />
            </label>
          )}
        </Modal>
      )}
    </div>
  );
}
