import { useEffect, useState, createContext, useContext } from "react";
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from "react-router-dom";
import { api } from "./api.js";
import Auth from "./Auth.jsx";
import Trips from "./Trips.jsx";
import TripDetail from "./TripDetail.jsx";
import KiteLogo from "./KiteLogo.jsx";
import SharedTrip from "./SharedTrip.jsx";

export const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  const navigate = useNavigate();
  const location = useLocation();

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

  const isSharedView = location.pathname.startsWith("/s/");

  // Signed out: the split sign-in screen owns the whole window (P-028).
  if (!user && !isSharedView) {
    return (
      <UserContext.Provider value={{ user, setUser }}>
        <Auth />
      </UserContext.Provider>
    );
  }

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Kite — home">
          <KiteLogo height={54} />
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
          <Route path="/" element={<Trips />} />
          <Route path="/trips/:id" element={<TripDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </UserContext.Provider>
  );
}
