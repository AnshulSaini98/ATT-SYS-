import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStoredUser, loginUser, setStoredUser } from "../services";
import uniBanner from "../assets/subharti-banner.webp";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      return;
    }

    // Skip login page when user is already stored locally.
    if (user.role === "teacher") {
      navigate("/teacher", { replace: true });
    } else if (user.role === "student") {
      navigate("/student", { replace: true });
    } else if (user.role === "admin") {
      navigate("/admin", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await loginUser({ email, password });
      setStoredUser(data.user);

      if (data.user.role === "teacher") {
        navigate("/teacher", { replace: true });
      } else if (data.user.role === "student") {
        navigate("/student", { replace: true });
      } else if (data.user.role === "admin") {
        navigate("/admin", { replace: true });
      } else {
        setError("This account role is not supported on the frontend.");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      <div className="login-hero card">
        <img className="login-banner" src={uniBanner} alt="Subharti University banner" />
        <div className="login-hero__overlay">
          <p className="muted">Swami Vivekanand Subharti University</p>
          <h2>BCA Department - Smart Attendance System</h2>
          <p className="muted small-note">Secure access for students, teachers, and admins.</p>
        </div>
      </div>

      <section className="card login-card">
        <h2>Login</h2>
        <p className="muted">Use your registered email and password.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}
      </section>
    </div>
  );
};

export default LoginPage;


