import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import {
  clearAllAuth,
  endTeacherSession,
  getSessionAttendanceSummary,
  getStoredUser,
  fetchTeacherSessions,
  getTeacherSubjectSummary,
  getTeacherDefaulters,
  getTeacherSubjects,
  manualAttendance,
  unmarkAttendance,
  startTeacherSession,
} from "../services";
import Loading from "../components/Loading";
import { getClassLabel } from "../utils";

const normalizeSection = (value) => String(value || "").trim().toUpperCase();
const getClassKey = (assignment) =>
  assignment?.sectionId
    ? String(assignment.sectionId)
    : `${assignment?.department || ""}|${Number(assignment?.year) || ""}|${normalizeSection(
        assignment?.section
      )}`;
const getAssignmentsForSubject = (assignments, subjectId) =>
  assignments.filter(
    (assignment) => String(assignment.subjectId) === String(subjectId)
  );
const getClassOptions = (assignments) => {
  const classMap = new Map();
  assignments.forEach((assignment) => {
    const classKey = getClassKey(assignment);
    if (!classKey || classMap.has(classKey)) return;
    classMap.set(classKey, {
      key: classKey,
      department: assignment.department,
      year: Number(assignment.year),
      section: normalizeSection(assignment.section),
      sectionId: assignment.sectionId || undefined,
      label:
        assignment.classLabel ||
        getClassLabel({
          courseName: assignment.department,
          yearNumber: assignment.year,
          sectionName: assignment.section,
        }),
    });
  });
  return Array.from(classMap.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState(null);
  const [session, setSession] = useState(null);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [qrImage, setQrImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [countdownSeconds, setCountdownSeconds] = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [subjectSummary, setSubjectSummary] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [defaulters, setDefaulters] = useState([]);
  const [defaulterLoading, setDefaulterLoading] = useState(false);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const isSessionActive = session ? session.isActive !== false : false;
  const timerRef = useRef(null);
  const assignmentsForSelectedSubject = getAssignmentsForSubject(
    teacherAssignments,
    selectedSubjectId
  );
  const classOptions = getClassOptions(assignmentsForSelectedSubject);
  const selectedClassOption = classOptions.find((item) => item.key === selectedClassKey) || null;

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== "teacher") {
      navigate("/", { replace: true });
      return;
    }
    setTeacher(user);
  }, [navigate]);

  useEffect(() => {
    if (teacher?.id) {
      loadRecentSessions(teacher.id);
      loadSubjectSummary(teacher.id);
      loadDefaulters(teacher.id);
      loadTeacherSubjects();
    }
  }, [teacher]);

  // Auto-load the most recent active session on page load
  useEffect(() => {
    if (recentSessions.length > 0 && !session) {
      const activeSessions = recentSessions.filter((s) => s.isActive);
      const sessionToLoad = activeSessions.length > 0 ? activeSessions[0] : recentSessions[0];
      
      setSession({
        sessionId: sessionToLoad.sessionId,
        isActive: sessionToLoad.isActive,
        startTime: sessionToLoad.startTime,
        subject: sessionToLoad.subject,
        department: sessionToLoad.department,
        year: sessionToLoad.year,
        section: sessionToLoad.section,
      });
      fetchAttendanceSummary(sessionToLoad.sessionId);
    }
  }, [recentSessions]);

  useEffect(() => {
    if (teacherAssignments.length === 0) {
      return;
    }

    let nextSubjectId = selectedSubjectId;
    if (
      !nextSubjectId ||
      !teacherAssignments.some(
        (assignment) => String(assignment.subjectId) === String(nextSubjectId)
      )
    ) {
      nextSubjectId = String(teacherAssignments[0].subjectId || "");
      if (nextSubjectId && nextSubjectId !== selectedSubjectId) {
        setSelectedSubjectId(nextSubjectId);
      }
    }

    const subjectAssignments = getAssignmentsForSubject(teacherAssignments, nextSubjectId);
    const availableClasses = getClassOptions(subjectAssignments);
    if (
      availableClasses.length > 0 &&
      !availableClasses.some((item) => item.key === selectedClassKey)
    ) {
      setSelectedClassKey(availableClasses[0].key);
    }
  }, [
    selectedClassKey,
    selectedSubjectId,
    teacherAssignments,
  ]);

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

  // Demo-only timer to visually expire the session QR after 5 minutes on the frontend.
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
              department: summary.department,
              year: summary.year,
              section: summary.section,
            }
          : current
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadRecentSessions = async (targetTeacherId) => {
    if (!targetTeacherId) return;
    setHistoryLoading(true);
    try {
      const data = await fetchTeacherSessions(targetTeacherId);
      setRecentSessions(data.sessions || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSubjectSummary = async (targetTeacherId) => {
    if (!targetTeacherId) return;
    setSubjectLoading(true);
    try {
      const data = await getTeacherSubjectSummary(targetTeacherId);
      setSubjectSummary(data.summary || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubjectLoading(false);
    }
  };

  const loadDefaulters = async (targetTeacherId) => {
    if (!targetTeacherId) return;
    setDefaulterLoading(true);
    try {
      const data = await getTeacherDefaulters(targetTeacherId);
      setDefaulters(data.defaulters || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setDefaulterLoading(false);
    }
  };

  const loadTeacherSubjects = async () => {
    try {
      const data = await getTeacherSubjects();
      const subjects = data.subjects || [];
      const assignments = (data.assignments || [])
        .map((assignment) => ({
          ...assignment,
          year: Number(assignment.year),
          section: normalizeSection(assignment.section),
          department: String(assignment.department || "").trim(),
        }))
        .filter(
          (assignment) =>
            assignment.subjectId &&
            Number.isInteger(assignment.year) &&
            assignment.section
        );

      setTeacherSubjects(subjects);
      setTeacherAssignments(assignments);

      if (assignments.length > 0) {
        const first = assignments[0];
        setSelectedSubjectId(String(first.subjectId));
        setSelectedClassKey(getClassKey(first));
      } else if (subjects.length > 0) {
        setSelectedSubjectId(String(subjects[0]._id));
      }
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleStartSession = async () => {
    if (!teacher) {
      setError("Teacher not loaded.");
      return;
    }

    if (teacherSubjects.length === 0) {
      setError("No subjects assigned. Ask admin to assign subjects first.");
      return;
    }

    if (!selectedSubjectId) {
      setError("Select one of your assigned subjects.");
      return;
    }

    if (teacherAssignments.length === 0) {
      setError("No class assignments found. Ask admin to assign subject/year/section.");
      return;
    }

    const match = teacherSubjects.find((s) => String(s._id) === String(selectedSubjectId));
    if (!match) {
      setError("Selected subject is not assigned to you.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!selectedClassOption) {
        setError("Please select one of your assigned classes.");
        setLoading(false);
        return;
      }

      const sessionYear = Number(selectedClassOption.year);
      const sessionSection = normalizeSection(selectedClassOption.section);

      const matchedAssignment = teacherAssignments.find(
        (assignment) =>
          String(assignment.subjectId) === String(selectedSubjectId) &&
          getClassKey(assignment) === selectedClassOption.key
      );
      if (!matchedAssignment) {
        setError("You are not assigned to this subject/class combination.");
        setLoading(false);
        return;
      }

      if (!sessionSection) {
        setError("Please select a valid section.");
        setLoading(false);
        return;
      }

      const data = await startTeacherSession({
        teacherId: teacher.id,
        subject: match.name,
        subjectId: selectedSubjectId,
        department:
          matchedAssignment.department ||
          teacher.department ||
          "BCA",
        year: sessionYear,
        section: sessionSection,
      });

      setSession(data);
      setAttendanceSummary(null);
      startLocalCountdown(); // Frontend-only countdown for visibility.

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

      await fetchAttendanceSummary(data.sessionId);
      await loadRecentSessions(teacher.id);
      await loadSubjectSummary(teacher.id);
      await loadDefaulters(teacher.id);

      setMessage("Session started. Share this QR with students.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  // Allow teacher to export the current session attendance to CSV for record keeping.
  const handleDownloadAttendance = () => {
    if (!attendanceSummary) return;

    const rows = [];
    rows.push(["Subject", session?.subject || "", ""]);
    rows.push(["Session ID", session?.sessionId || "", ""]);
    rows.push(["Date", session?.startTime ? new Date(session.startTime).toLocaleString() : "", ""]);
    rows.push([]);
    rows.push(["Name", "Email", "Status"]);

    attendanceSummary.presentStudents.forEach((student) => {
      rows.push([student.name || "", student.email || "", "Present"]);
    });
    attendanceSummary.absentStudents.forEach((student) => {
      rows.push([student.name || "", student.email || "", "Absent"]);
    });

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeSubject = session?.subject ? session.subject.replace(/\\s+/g, "_").toLowerCase() : "session";
    link.download = `attendance_${safeSubject}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCountdownSeconds(0);
      await fetchAttendanceSummary(session.sessionId);
      await loadRecentSessions(teacher.id);
      await loadSubjectSummary(teacher.id);
      await loadDefaulters(teacher.id);
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
    await loadDefaulters(teacher.id);
  };

  // Derived quick stats for header cards.
  const totalStudents = attendanceSummary?.totalStudents ?? 0;
  const totalSessions = recentSessions.length;
  const averageAttendanceOverall =
    subjectSummary.length === 0
      ? 0
      : Number(
          (
            subjectSummary.reduce((acc, item) => acc + (item.averageAttendancePercentage || 0), 0) /
            subjectSummary.length
          ).toFixed(2)
        );

  return (
    <section className="card" id="dashboard">
      <div className="row-between">
        <h2>Teacher Dashboard</h2>
        <button type="button" className="secondary-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <p className="muted">Logged in as: {teacher?.name}</p>
      <p style={{ fontSize: "16px", fontWeight: "600", color: "#1f2937", margin: "8px 0" }}>
        📍 <strong>Current Class:</strong> {selectedClassOption?.label || "Select assigned subject and class"}
      </p>

      <label htmlFor="subject">Subject</label>
      {teacherSubjects.length > 0 ? (
        <select
          id="subject"
          value={selectedSubjectId}
          onChange={(event) => setSelectedSubjectId(event.target.value)}
        >
          <option value="">Select assigned subject</option>
          {teacherSubjects.map((subj) => (
            <option key={subj._id} value={subj._id}>
              {subj.name}
              {subj.year ? ` (Year ${subj.year})` : ""}
            </option>
          ))}
        </select>
      ) : (
        <p className="muted">No subjects assigned yet. Ask admin to assign.</p>
      )}

      <label htmlFor="session-class">Class</label>
      <select
        id="session-class"
        value={selectedClassOption ? selectedClassOption.key : ""}
        disabled={classOptions.length === 0}
        onChange={(event) => setSelectedClassKey(event.target.value)}
      >
        {classOptions.length === 0 ? (
          <option value="">No assigned classes</option>
        ) : (
          classOptions.map((classOption) => (
            <option key={classOption.key} value={classOption.key}>
              {classOption.label}
            </option>
          ))
        )}
      </select>
      {classOptions.length > 0 ? (
        <p className="muted small-note">
          Assigned classes: {classOptions.map((item) => item.label).join(", ")}
        </p>
      ) : null}

      <div className="button-row">
        <button type="button" className="primary-btn" onClick={handleStartSession} disabled={loading}>
          {loading ? "Please wait..." : "🎬 Start Session"}
        </button>
        <button type="button" className="danger-btn" onClick={handleEndSession} disabled={loading || !isSessionActive}>
          🛑 End Session
        </button>
      </div>

      {session ? (
        <div className="session-box">
          <div className="row-between session-meta-row">
            <p style={{ margin: "0" }}>
              <strong>📊 Session Status:</strong>{" "}
              <span className={`status-badge ${isSessionActive ? "active" : "expired"}`}>
                {isSessionActive ? "🟢 Active" : "🛑 Ended"}
              </span>
            </p>
            <button
              type="button"
              className="secondary-btn small-btn"
              onClick={handleRefreshAttendance}
              disabled={summaryLoading || loading}
            >
              {summaryLoading ? "Refreshing..." : "🔄 Refresh"}
            </button>
          </div>
          <p style={{ margin: "10px 0" }}>
            <strong>Session ID:</strong> <code style={{ backgroundColor: "#f3f4f6", padding: "2px 6px", borderRadius: "4px" }}>{session.sessionId}</code>
          </p>
          <p style={{ margin: "10px 0" }}>
            <strong>📚 Subject:</strong> {session.subject}
          </p>
          <p style={{ margin: "10px 0" }}>
            <strong>👥 Class:</strong>{" "}
            <span style={{ fontWeight: "600", color: "#2563eb" }}>
              {session.classLabel ||
                getClassLabel({
                  courseName: session.department,
                  yearNumber: session.year ?? selectedClassOption?.year,
                  sectionName: session.section || selectedClassOption?.section,
                })}
            </span>
          </p>
          <p style={{ margin: "10px 0" }}>
            <strong>⏰ Started At:</strong> {new Date(session.startTime).toLocaleString()}
          </p>
          <p style={{ margin: "10px 0" }}>
            <strong>🔐 Session Token:</strong>{" "}
            <code style={{ backgroundColor: "#f3f4f6", padding: "2px 6px", borderRadius: "4px", fontSize: "12px" }}>
              {session.sessionToken}
            </code>
          </p>
          <p className="muted small-note">
            Demo timer only: backend does not auto-expire sessions.
          </p>

          <div className="info-pill">
            <strong>⏱️ Session expires in:</strong> {formatCountdown(countdownSeconds)}
          </div>

          {isSessionActive ? (
            <p className="live-counter">
              <span style={{ fontSize: "16px" }}>
                <strong>✓ Present:</strong>{" "}
                <span style={{ color: "#16a34a", fontWeight: "700" }}>
                  {attendanceSummary?.totalPresent ?? 0}
                </span>{" "}
                / {attendanceSummary?.totalStudents ?? "-"}
              </span>
            </p>
          ) : null}

          {qrImage ? (
            <div className="qr-container">
              <p className="qr-label">📱 Share this QR with students</p>
              <img className="qr-image" src={qrImage} alt="Session QR" />
            </div>
          ) : null}
        </div>
      ) : null}

      {session && attendanceSummary ? (
        <div className="summary-card">
          <div className="row-between">
            <h3>📋 Session Attendance Summary</h3>
            <div className="button-row" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="secondary-btn small-btn"
                onClick={handleDownloadAttendance}
                disabled={!attendanceSummary}
              >
                📥 Download CSV
              </button>
            </div>
          </div>
          <div className="summary-grid">
            <p style={{ margin: "8px 0" }}>
              <strong>👥 Total Students:</strong> {attendanceSummary.totalStudents}
            </p>
            <p style={{ margin: "8px 0" }}>
              <strong>✓ Present:</strong> <span style={{ color: "#16a34a", fontWeight: "700" }}>{attendanceSummary.totalPresent}</span>
            </p>
            <p style={{ margin: "8px 0" }}>
              <strong>✗ Absent:</strong> <span style={{ color: "#dc2626", fontWeight: "700" }}>{attendanceSummary.totalAbsent}</span>
            </p>
            <p style={{ margin: "8px 0" }}>
              <strong>📊 Attendance %:</strong> <span style={{ color: "#2563eb", fontWeight: "700" }}>{attendanceSummary.attendancePercentage}%</span>
            </p>
          </div>

          <h4 style={{ marginTop: "16px", marginBottom: "12px" }}>✓ Present Students ({attendanceSummary.presentStudents.length})</h4>
          {attendanceSummary.presentStudents.length === 0 ? (
            <p className="muted">No student marked attendance.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ backgroundColor: "#dcfce7" }}>
                    <th>Name</th>
                    <th>Email</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                    <th style={{ textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.presentStudents.map((student) => (
                    <tr key={`present-${student.email}`}>
                      <td>{student.name}</td>
                      <td>{student.email}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className="badge present">✓ Present</span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="danger-btn small-btn"
                          disabled={loading || !isSessionActive}
                          onClick={async () => {
                            if (!session?.sessionId || !teacher?.id || !student.id) return;
                            try {
                              setError("");
                              setMessage("");
                              await unmarkAttendance({
                                teacherId: teacher.id,
                                studentId: student.id,
                                sessionId: session.sessionId,
                              });
                              await fetchAttendanceSummary(session.sessionId);
                              await loadDefaulters(teacher.id);
                              setMessage("Attendance unmarked.");
                            } catch (requestError) {
                              setError(requestError.message);
                            }
                          }}
                        >
                          Unmark
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h4 style={{ marginTop: "20px", marginBottom: "12px" }}>✗ Absent Students ({attendanceSummary.absentStudents.length})</h4>
          {attendanceSummary.absentStudents.length === 0 ? (
            <p className="muted">No absent students.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ backgroundColor: "#fee2e2" }}>
                    <th>Name</th>
                    <th>Email</th>
                    <th style={{ textAlign: "center" }}>Status</th>
                    <th style={{ textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.absentStudents.map((student) => (
                    <tr key={`absent-${student.email}`}>
                      <td>{student.name}</td>
                      <td>{student.email}</td>
                      <td style={{ textAlign: "center" }}>
                        <span className="badge absent">✗ Absent</span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          className="success-btn small-btn"
                          disabled={loading || !isSessionActive}
                          onClick={async () => {
                            if (!session?.sessionId || !teacher?.id || !student.id) return;
                            try {
                              setError("");
                              setMessage("");
                              await manualAttendance({
                                teacherId: teacher.id,
                                studentId: student.id,
                                sessionId: session.sessionId,
                              });
                              await fetchAttendanceSummary(session.sessionId);
                              await loadDefaulters(teacher.id);
                              setMessage("Student marked present.");
                            } catch (requestError) {
                              setError(requestError.message || "Could not mark manually. Make sure you own this session.");
                            }
                          }}
                        >
                          ✓ Mark Present
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="summary-card" id="summary">
        <h3>📚 Your Subjects & Performance</h3>
        {subjectLoading ? <Loading label="Loading subject stats..." /> : null}
        {!subjectLoading && subjectSummary.length === 0 ? (
          <p className="muted">No subject stats yet.</p>
        ) : null}
        {!subjectLoading && subjectSummary.length > 0 ? (
          <div className="card-grid">
            {subjectSummary.map((item) => {
              const pct = item.averageAttendancePercentage || 0;
              const width = `${Math.min(Math.max(pct, 0), 100)}%`;
              const underRequired = pct < 75;
              return (
                <div className="mini-card hover-card" key={item.subject}>
                  <div className="row-between">
                    <h4 style={{ margin: "0 0 8px 0" }}>{item.subject}</h4>
                    <span className={`badge ${underRequired ? "absent" : "present"}`}>
                      {underRequired ? "⚠ Below 75%" : "✓ On Track"}
                    </span>
                  </div>
                  <p className="muted" style={{ margin: "6px 0" }}>Total Sessions: {item.totalSessions}</p>
                  <div className="progress-track">
                    <div
                      className={`progress-bar ${underRequired ? "warn" : "good"}`}
                      style={{ width }}
                    />
                  </div>
                  <p className="muted small-note">Avg attendance: {pct}%</p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="summary-card" id="defaulters">
        <h3>⚠️ Defaulter List (Below 75%)</h3>
        {defaulterLoading ? <Loading label="Loading defaulters..." /> : null}
        {!defaulterLoading && defaulters.length === 0 ? (
          <p className="muted">✅ Great! No defaulters right now.</p>
        ) : null}
        {!defaulterLoading && defaulters.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr style={{ backgroundColor: "#fee2e2" }}>
                  <th>Student</th>
                  <th>Subject</th>
                  <th>Attendance %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {defaulters.map((item, idx) => (
                  <tr key={`${item.studentName}-${item.subject}-${idx}`}>
                    <td>{item.studentName}</td>
                    <td>{item.subject}</td>
                    <td style={{ fontWeight: "600", color: "#b91c1c" }}>{item.percentage}%</td>
                    <td>
                      <span className="badge absent">⚠ Below Required</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="summary-card" id="sessions">
        <h3>Recent Sessions</h3>
        {historyLoading ? <Loading label="Loading recent sessions..." /> : null}
        {!historyLoading && recentSessions.length === 0 ? (
          <p className="muted">No recent sessions yet.</p>
        ) : null}
        {!historyLoading && recentSessions.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Class</th>
                  <th>Date</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSessions.map((item) => (
                  <tr 
                    key={item.sessionId}
                    onClick={() => {
                      setSession({
                        sessionId: item.sessionId,
                        isActive: item.isActive,
                        startTime: item.startTime,
                        subject: item.subject,
                        department: item.department,
                        year: item.year,
                        section: item.section,
                      });
                      fetchAttendanceSummary(item.sessionId);
                    }}
                    style={{ cursor: "pointer" }}
                    className={session?.sessionId === item.sessionId ? "highlight" : ""}
                  >
                    <td>{item.subject}</td>
                    <td>
                      {item.classLabel ||
                        getClassLabel({
                          courseName: item.department,
                          yearNumber: item.year,
                          sectionName: item.section,
                        })}
                    </td>
                    <td>{new Date(item.startTime).toLocaleString()}</td>
                    <td>{item.presentCount}</td>
                    <td>{item.absentCount}</td>
                    <td className="capitalize">{item.isActive ? "active" : "ended"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
};

export default TeacherDashboard;
