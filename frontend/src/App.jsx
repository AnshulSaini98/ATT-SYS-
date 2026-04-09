import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import { getDefaultPathForUser } from "./utils/pathUtils";
import LoginPage from "./pages/LoginPage";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import { clearAllAuth, getStoredUser } from "./services";
import crestLogo from "./assets/subharti-logo.png";

const App = () => {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const defaultPath = getDefaultPathForUser(currentUser);

  const handleLogout = () => {
    clearAllAuth();
    navigate("/", { replace: true });
  };

  const handleNav = (target) => {
    if (target === "dashboard") {
      navigate(defaultPath, { replace: true });
      return;
    }
    // for section anchors, keep same page and scroll.
    const el = document.getElementById(target);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="app-shell layout-grid">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={crestLogo} alt="Subharti University crest" />
          <div>
            <p className="brand-sub">Swami Vivekanand Subharti University</p>
            <h1>BCA Department - Smart Attendance System</h1>
          </div>
        </div>
        <div className="user-meta">
          {currentUser ? (
            <>
              <div className="user-pill">
                <span className="user-name">{currentUser.name}</span>
                <span className="user-role">{currentUser.role}</span>
              </div>
              <button className="secondary-btn small-btn" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <p className="muted">Not logged in</p>
          )}
        </div>
      </header>

      <aside className="sidebar">
        <button type="button" className="nav-link" onClick={() => handleNav("dashboard")}>
          Dashboard
        </button>
        <button type="button" className="nav-link" onClick={() => handleNav("sessions")}>
          Sessions
        </button>
        <button type="button" className="nav-link" onClick={() => handleNav("summary")}>
          Summary
        </button>
        <button type="button" className="nav-link logout-link" onClick={handleLogout}>
          Logout
        </button>
      </aside>

      <main className="page">
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route
            path="/teacher"
            element={
              <ProtectedRoute requiredRole="teacher">
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute requiredRole="student">
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to={defaultPath} replace />} />
        </Routes>
      </main>

      <footer className="footer">
        <p>(c) {new Date().getFullYear()} BCA Department - Smart Attendance System</p>
      </footer>
    </div>
  );
};

export default App;



