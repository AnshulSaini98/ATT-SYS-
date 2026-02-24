import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import {
  clearStoredUser,
  endTeacherSession,
  getSessionAttendanceSummary,
  getStoredUser,
  startTeacherSession,
} from "../services";

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [subject, setSubject] = useState("");
  const [session, setSession] = useState(null);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [qrImage, setQrImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const isSessionActive = session ? session.isActive !== false : false;

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== "teacher") {
      navigate("/", { replace: true });
      return;
    }
    setTeacher(user);
  }, [navigate]);

  const handleLogout = () => {
    clearStoredUser();
    navigate("/", { replace: true });
  };

  // Reusable fetch used after ending session and for manual live refresh.
  const fetchAttendanceSummary = async (targetSessionId) => {
    if (!targetSessionId) {
      return;
    }

    setSummaryLoading(true);

    try {
      const summary = await getSessionAttendanceSummary(targetSessionId);
      setAttendanceSummary(summary);

      // Keep local session state in sync with backend session status/time.
      setSession((current) =>
        current && current.sessionId === targetSessionId
          ? {
              ...current,
              isActive: summary.isActive,
              startTime: summary.startTime,
              subject: summary.subject,
            }
          : current
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleStartSession = async () => {
    if (!teacher || !subject.trim()) {
      setError("Please enter a subject.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const data = await startTeacherSession({
        teacherId: teacher.id,
        subject: subject.trim(),
      });

      setSession(data);
      setAttendanceSummary(null);

      // If backend sends base64 QR, use it directly. Otherwise generate from token.
      if (data.qrImage) {
        const src = data.qrImage.startsWith("data:image")
          ? data.qrImage
          : `data:image/png;base64,${data.qrImage}`;
        setQrImage(src);
      } else {
        const qrInput = data.qrData || data.sessionToken;
        const generated = await QRCode.toDataURL(qrInput);
        setQrImage(generated);
      }

      setMessage("Session started. Show this QR to students.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!session?.sessionId) {
      setError("No active session to end.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await endTeacherSession({ sessionId: session.sessionId });
      setSession((current) => (current ? { ...current, isActive: false } : current));
      await fetchAttendanceSummary(session.sessionId);
      setMessage("Session ended successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshAttendance = async () => {
    if (!session?.sessionId) {
      return;
    }

    setError("");
    await fetchAttendanceSummary(session.sessionId);
  };

  return (
    <section className="card">
      <div className="row-between">
        <h2>Teacher Dashboard</h2>
        <button type="button" className="secondary-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <p className="muted">Logged in as: {teacher?.name}</p>

      <label htmlFor="subject">Subject</label>
      <input
        id="subject"
        type="text"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="Example: Math"
      />

      <div className="button-row">
        <button type="button" onClick={handleStartSession} disabled={loading}>
          {loading ? "Please wait..." : "Start Session"}
        </button>
        <button type="button" className="danger-btn" onClick={handleEndSession} disabled={loading}>
          End Session
        </button>
      </div>

      {session ? (
        <div className="session-box">
          <div className="row-between session-meta-row">
            <p>
              <strong>Status:</strong>{" "}
              <span className={`status-badge ${isSessionActive ? "active" : "ended"}`}>
                {isSessionActive ? "Active" : "Ended"}
              </span>
            </p>
            <button
              type="button"
              className="secondary-btn"
              onClick={handleRefreshAttendance}
              disabled={summaryLoading || loading}
            >
              {summaryLoading ? "Refreshing..." : "Refresh Attendance"}
            </button>
          </div>
          <p>
            <strong>Session ID:</strong> {session.sessionId}
          </p>
          <p>
            <strong>Subject:</strong> {session.subject}
          </p>
          <p>
            <strong>Started At:</strong> {new Date(session.startTime).toLocaleString()}
          </p>
          <p>
            <strong>Session Token:</strong> {session.sessionToken}
          </p>

          {isSessionActive ? (
            <p className="live-counter">
              <strong>Live Present Count:</strong> {attendanceSummary?.totalPresent ?? 0}
            </p>
          ) : null}

          {qrImage ? <img className="qr-image" src={qrImage} alt="Session QR" /> : null}
        </div>
      ) : null}

      {session && !isSessionActive && attendanceSummary ? (
        <div className="summary-card">
          <h3>Session Attendance Summary</h3>
          <div className="summary-grid">
            <p>
              <strong>Total Students:</strong> {attendanceSummary.totalStudents}
            </p>
            <p>
              <strong>Total Present:</strong> {attendanceSummary.totalPresent}
            </p>
            <p>
              <strong>Total Absent:</strong> {attendanceSummary.totalAbsent}
            </p>
            <p>
              <strong>Attendance %:</strong> {attendanceSummary.attendancePercentage}%
            </p>
          </div>

          <h4>Present Students</h4>
          {attendanceSummary.presentStudents.length === 0 ? (
            <p className="muted">No student marked attendance.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.presentStudents.map((student) => (
                    <tr key={`present-${student.email}`}>
                      <td>{student.name}</td>
                      <td>{student.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4>Absent Students</h4>
          {attendanceSummary.absentStudents.length === 0 ? (
            <p className="muted">No absent students.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.absentStudents.map((student) => (
                    <tr key={`absent-${student.email}`}>
                      <td>{student.name}</td>
                      <td>{student.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
};

export default TeacherDashboard;
