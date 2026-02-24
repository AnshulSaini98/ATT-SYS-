import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRScanner from "../components/QRScanner";
import { clearStoredUser, getStoredUser, submitAttendance as markStudentAttendance } from "../services";
import { extractSessionToken } from "../utils";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMarked, setHasMarked] = useState(false);
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== "student") {
      navigate("/", { replace: true });
      return;
    }
    setStudent(user);
  }, [navigate]);

  const handleLogout = () => {
    clearStoredUser();
    navigate("/", { replace: true });
  };

  const submitAttendanceRequest = useCallback(
    async (tokenValue) => {
      if (!student?.id) {
        return;
      }

      setLoading(true);
      setError("");
      setAttendanceResult(null);

      try {
        const data = await markStudentAttendance({
          studentId: student.id,
          sessionToken: tokenValue,
        });
        setHasMarked(true);
        setAttendanceResult({
          message: data.message || "Attendance Marked Successfully",
          studentName: data.studentName,
          subject: data.subject,
          timestamp: data.timestamp,
        });
      } catch (requestError) {
        if (requestError.message.toLowerCase().includes("not active")) {
          setError("Session is inactive. Attendance can no longer be marked.");
        } else {
          setError(requestError.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [student, markStudentAttendance]
  );

  const handleScanned = useCallback(
    (decodedText) => {
      if (hasMarked) {
        return;
      }
      const token = extractSessionToken(decodedText);
      if (!token || loading) {
        return;
      }
      setSessionToken(token);
      submitAttendanceRequest(token);
    },
    [hasMarked, loading, submitAttendanceRequest]
  );

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    const token = extractSessionToken(sessionToken);

    if (!token) {
      setError("Please enter a valid session token.");
      return;
    }

    await submitAttendanceRequest(token);
  };

  return (
    <section className="card">
      <div className="row-between">
        <h2>Student Dashboard</h2>
        <button type="button" className="secondary-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <p className="muted">Logged in as: {student?.name}</p>

      <h3>Scan QR Code</h3>
      <p className="muted">Allow camera access, then scan the teacher QR.</p>
      <QRScanner scannerId="student-qr-scanner" onScan={handleScanned} />

      <h3>Or enter token manually</h3>
      <form onSubmit={handleManualSubmit}>
        <label htmlFor="sessionToken">Session Token</label>
        <input
          id="sessionToken"
          type="text"
          value={sessionToken}
          onChange={(event) => setSessionToken(event.target.value)}
          placeholder="Paste or scan token"
        />
        <button type="submit" disabled={loading || hasMarked}>
          {loading ? "Submitting..." : "Mark Attendance"}
        </button>
      </form>

      {hasMarked ? <p className="muted">Attendance already submitted for this login.</p> : null}
      {attendanceResult ? (
        <div className="result-box success-box">
          <p className="success">{attendanceResult.message}</p>
          <p>
            <strong>Student:</strong> {attendanceResult.studentName || student?.name}
          </p>
          <p>
            <strong>Subject:</strong> {attendanceResult.subject || "N/A"}
          </p>
          <p>
            <strong>Time:</strong>{" "}
            {attendanceResult.timestamp
              ? new Date(attendanceResult.timestamp).toLocaleString()
              : "N/A"}
          </p>
        </div>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
};

export default StudentDashboard;
