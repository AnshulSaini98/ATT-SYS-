import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute, { getDefaultPathForUser } from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import { getStoredUser } from "./services";

const App = () => {
  const currentUser = getStoredUser();
  const defaultPath = getDefaultPathForUser(currentUser);

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>Smart QR Attendance System</h1>
      </header>

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
          <Route path="*" element={<Navigate to={defaultPath} replace />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;
