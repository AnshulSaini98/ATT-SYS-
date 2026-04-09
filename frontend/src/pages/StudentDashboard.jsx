import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRScanner from "../components/QRScanner";
import Loading from "../components/Loading";
import {
  clearAllAuth,
  getStudentProfile,
  getSessionAttendanceSummary,
  getStoredUser,
  getStudentSubjectSummary,
  submitAttendance as markStudentAttendance,
} from "../services";
import { extractSessionToken, getClassLabel } from "../utils";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [sessionToken, setSessionToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasMarked, setHasMarked] = useState(false);
  const [attendanceResult, setAttendanceResult] = useState(null);
  const [error, setError] = useState("");
  const [countdownSeconds, setCountdownSeconds] = useState(null);
  const [attendancePercent, setAttendancePercent] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [subjectSummary, setSubjectSummary] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const timerRef = useRef(null);
  const isTimerExpired = countdownSeconds === 0;
  const disableMarking = loading || hasMarked || isTimerExpired;
  const isAtRisk = attendancePercent !== null && attendancePercent < 75;
  const progressWidth =
    attendancePercent === null ? "0%" : `${Math.min(Math.max(attendancePercent, 0), 100)}%`;
  const avgSubjectPercent =
    subjectSummary.length === 0
      ? 0
      : Number(
          (
            subjectSummary.reduce((acc, item) => acc + (item.percentage || 0), 0) /
            subjectSummary.length
          ).toFixed(2)
        );
  const classLabel = getClassLabel({
    courseName: student?.courseName || student?.department,
    yearNumber: student?.yearNumber ?? student?.year,
    sectionName: student?.sectionName || student?.section,
  });

  useEffect(() => {
    const loadStudent = async () => {
      const user = getStoredUser();
      if (!user || user.role !== "student") {
        navigate("/", { replace: true });
        return;
      }

      try {
        const data = await getStudentProfile();
        setStudent(data.student || user);
      } catch (_err) {
        // Keep dashboard usable with locally cached profile if API profile fetch fails.
        setStudent(user);
      }
    };
    loadStudent();
  }, [navigate]);

  useEffect(() => {
    const loadSubjectSummary = async () => {
      if (!student) return;
      setSubjectLoading(true);
      try {
        const data = await getStudentSubjectSummary();
        setSubjectSummary(data.summary || []);
      } catch (err) {
        setError(err?.message || "Could not load subject summary.");
      } finally {
        setSubjectLoading(false);
      }
    };
    loadSubjectSummary();
  }, [student]);

  const handleLogout = () => {
    clearAllAuth();
    navigate("/", { replace: true });
  };

  const formatCountdown = (seconds) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = Math.max(seconds % 60, 0)
      .toString()
      .padStart(2, "0");
    return `${mins}:${secs}`;
  };

  // Demo-only timer: expires local UI after 5 minutes to mimic session expiry.
  const startLocalCountdown = (durationSeconds = 300) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setCountdownSeconds(durationSeconds);
    timerRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    },
    []
  );

  const pullSessionSummary = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setSummaryLoading(true);
    try {
      const data = await getSessionAttendanceSummary(sessionId);
      setAttendancePercent(typeof data.attendancePercentage === "number" ? data.attendancePercentage : null);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  const submitAttendanceRequest = useCallback(
    async (tokenValue) => {
      if (!student?.id) {
        return;
      }

      setLoading(true);
      setError("");
      setAttendanceResult(null);
      setAttendancePercent(null);

      try {
        const data = await markStudentAttendance({
          sessionToken: tokenValue,
        });
        setHasMarked(true);
        setAttendanceResult({
          message: data.message || "Attendance recorded. Thank you!",
          studentName: data.studentName,
          subject: data.subject,
          timestamp: data.timestamp,
        });
        await pullSessionSummary(data.sessionId);
      } catch (requestError) {
        const msg = (requestError?.message || "").toLowerCase();
        if (msg.includes("not active")) {
          setError("Session is inactive. Attendance can no longer be marked.");
        } else {
          setError(requestError?.message || "Could not mark attendance right now.");
        }
      } finally {
        setLoading(false);
      }
    },
    [student, markStudentAttendance, pullSessionSummary]
  );

  const handleScanned = useCallback(
    (decodedText) => {
      if (hasMarked || isTimerExpired) {
        return;
      }
      const token = extractSessionToken(decodedText);
      if (!token || loading) {
        return;
      }
      if (countdownSeconds === null) {
        startLocalCountdown();
      }
      setSessionToken(token);
      submitAttendanceRequest(token);
    },
    [hasMarked, isTimerExpired, countdownSeconds, loading, submitAttendanceRequest]
  );

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    const token = extractSessionToken(sessionToken);

    if (!token) {
      setError("Please enter a valid session token.");
      return;
    }

    if (isTimerExpired) {
      setError("This session window has closed. Please ask for a fresh QR.");
      return;
    }

    if (countdownSeconds === null) {
      startLocalCountdown();
    }

    await submitAttendanceRequest(token);
  };

  return (
    <section className="card" id="dashboard">
      <div className="row-between">
        <h2>Student Dashboard</h2>
        <button type="button" className="secondary-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <p className="muted">Logged in as: {student?.name}</p>
      <p style={{ fontSize: "16px", fontWeight: "600", color: "#1f2937", margin: "8px 0" }}>
        📚 <strong>Your Class:</strong> {classLabel}
      </p>

      <div className="card-grid top-stats">
        <div className="mini-card hover-card">
          <p className="muted">Overall Attendance</p>
          <h3>{avgSubjectPercent}%</h3>
        </div>
        <div className="mini-card hover-card">
          <p className="muted">Subjects</p>
          <h3>{subjectSummary.length}</h3>
        </div>
        <div className="mini-card hover-card">
          <p className="muted">Last Session</p>
          <h3>{attendancePercent !== null ? `${attendancePercent}%` : "--"}</h3>
        </div>
      </div>

      <div className="info-pill">
        <strong>Session expires in:</strong> {formatCountdown(countdownSeconds)}
      </div>
      <p className="muted small-note">
        Demo timer only: once it hits zero, this page disables marking; server validation still applies.
      </p>

      <div style={{ marginTop: "24px" }}>
        <h3 style={{ textAlign: "center", marginBottom: "16px" }}>✨ Mark Your Attendance</h3>
        
        <div className="qr-container">
          <p className="qr-label">📱 Scan QR Code to Mark Attendance</p>
          <p className="muted small-note">Allow camera access, then scan the QR code shown by your teacher</p>
          <QRScanner scannerId="student-qr-scanner" onScan={handleScanned} />
        </div>
      </div>

      <div style={{ marginTop: "20px" }}>
        <p style={{ textAlign: "center", color: "#6b7280", fontSize: "14px", margin: "12px 0" }}>
          — Or —
        </p>
        <h4 style={{ textAlign: "center", marginBottom: "14px" }}>Enter Session Token Manually</h4>
        <form onSubmit={handleManualSubmit}>
          <label htmlFor="sessionToken">Session Token</label>
          <input
            id="sessionToken"
            type="text"
            value={sessionToken}
            onChange={(event) => setSessionToken(event.target.value)}
            placeholder="Paste or scan token"
          />
          <button 
            type="submit" 
            className="primary-btn"
            disabled={disableMarking}
            style={{ width: "100%" }}
          >
            {loading
              ? "Submitting..."
              : isTimerExpired
              ? "Session Closed"
              : hasMarked
              ? "Already Marked"
              : "✓ Mark Attendance"}
          </button>
        </form>
      </div>

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
      {summaryLoading ? <Loading label="Updating attendance stats..." /> : null}
      {attendancePercent !== null ? (
        <div className="risk-box">
          <p className={isAtRisk ? "error" : "success"}>
            {isAtRisk
              ? "Warning: Attendance below required 75%."
              : "On track: attendance is healthy."}
          </p>
          <div className="progress-track">
            <div
              className={`progress-bar ${isAtRisk ? "warn" : "good"}`}
              style={{ width: progressWidth }}
            />
          </div>
          <p className="muted small-note">Current session attendance: {attendancePercent}%</p>
        </div>
      ) : null}
      <div className="summary-card" id="summary">
        <h3>📊 Subject-wise Attendance</h3>
        {subjectLoading ? <Loading label="Loading subjects..." /> : null}
        {!subjectLoading && subjectSummary.length === 0 ? (
          <p className="muted">No subjects to show yet.</p>
        ) : null}
        {!subjectLoading && subjectSummary.length > 0 ? (
          <div className="card-grid">
            {subjectSummary.map((item) => {
              const underRequired = item.percentage < 75;
              const width =
                item.percentage === null
                  ? "0%"
                  : `${Math.min(Math.max(item.percentage, 0), 100)}%`;
              return (
                <div className="mini-card" key={item.subject}>
                  <div className="row-between">
                    <h4 style={{ margin: "0 0 8px 0" }}>{item.subject}</h4>
                    <span className={`badge ${underRequired ? "absent" : "present"}`}>
                      {underRequired ? "⚠ Below 75%" : "✓ On Track"}
                    </span>
                  </div>
                  <p className="muted" style={{ margin: "6px 0 8px 0" }}>
                    {item.attendedSessions} / {item.totalSessions} sessions attended
                  </p>
                  <div className="progress-track">
                    <div
                      className={`progress-bar ${underRequired ? "warn" : "good"}`}
                      style={{ width }}
                    />
                  </div>
                  <p className="muted small-note">{item.percentage}% attendance</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
};

export default StudentDashboard;
