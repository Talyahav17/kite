import { useEffect, useState, createContext, useContext } from "react";
import { Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "./api.js";
import Auth from "./Auth.jsx";
import KiteLogo from "./KiteLogo.jsx";
import SharedTrip from "./SharedTrip.jsx";
import Trips from "./Trips.jsx";
import TripDetail from "./TripDetail.jsx";

const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const navigate = useNavigate();

  useEffect(() => {
    api
      .me()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
    navigate("/");
  }

  if (user === undefined) return <div className="page-loading">Loading…</div>;

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <header className="topbar">
        <Link to="/" className="brand">
          <KiteLogo /> Kite
        </Link>
        {user && (
          <div className="topbar-right">
            <span className="topbar-name">{user.name}</span>
            <button className="btn btn-ghost" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="content">
        <Routes>
          {/* public: a share link works without an account (P-018) */}
          <Route path="/s/:token" element={<SharedTrip />} />
          {user ? (
            <>
              <Route path="/" element={<Trips />} />
              <Route path="/trips/:id" element={<TripDetail />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <Route path="*" element={<Auth />} />
          )}
        </Routes>
      </main>
    </UserContext.Provider>
  );
}
