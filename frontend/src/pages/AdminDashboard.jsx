import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearAllAuth,
  createManagedUser,
  deleteManagedUser,
  fetchClasses,
  fetchManagedUsers,
  getStoredUser,
  updateManagedUser,
  toggleUserActive,
  getSystemSummary,
  getSessionLog,
  fetchSubjects,
  createSubject,
  deleteSubject,
  getStudentAttendanceHistory,
  exportAttendanceReport,
  getClassSubjects,
  getClassTeachers,
  assignSubjectsToClass,
} from "../services";
import { getClassLabel } from "../utils";

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "teacher",
  department: "BCA",
  year: "",
  section: "",
  sectionId: "",
  subjects: [],
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingUserId, setEditingUserId] = useState(null);
  const [roleFilter, setRoleFilter] = useState("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [teacherSubjectFilter, setTeacherSubjectFilter] = useState("all");
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjectName, setSubjectName] = useState("");
  const [subjectDept, setSubjectDept] = useState("BCA");
  const [subjectYear, setSubjectYear] = useState("1");
  const [systemSummary, setSystemSummary] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalSessions: 0,
    totalAttendanceRecords: 0,
  });
  const [sessionLog, setSessionLog] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  // Subject assignment by class
  const [selectedClassForAssignment, setSelectedClassForAssignment] = useState("");
  const [classSubjectsData, setClassSubjectsData] = useState(null);
  const [classTeachersData, setClassTeachersData] = useState(null);
  const [selectedSubjectsForClass, setSelectedSubjectsForClass] = useState([]);
  const [selectedTeachersForAssignment, setSelectedTeachersForAssignment] = useState([]);

  const roleLabel = useMemo(
    () => (editingUserId ? "Update User" : "Add User"),
    [editingUserId]
  );

  // Extract courses and sections from students
  const courseAndSectionOptions = useMemo(() => {
    const coursesSet = new Set();
    const sectionsSet = new Set();
    users
      .filter((user) => user.role === "student")
      .forEach((student) => {
        const course = student.courseName || student.department || "Unknown";
        const section = student.sectionName || student.section || "Unknown";
        coursesSet.add(course);
        sectionsSet.add(section);
      });
    return {
      courses: Array.from(coursesSet).sort(),
      sections: Array.from(sectionsSet).sort(),
    };
  }, [users]);

  // Get all unique subjects from teachers
  const teacherSubjects = useMemo(() => {
    const subjectsSet = new Set();
    users
      .filter((user) => user.role === "teacher")
      .forEach((teacher) => {
        if (Array.isArray(teacher.subjects)) {
          teacher.subjects.forEach((s) => {
            const subjectName = s.name || s;
            if (subjectName) subjectsSet.add(subjectName);
          });
        }
      });
    return Array.from(subjectsSet).sort();
  }, [users]);

  const studentGroups = useMemo(() => {
    const groups = new Map();
    users
      .filter((user) => user.role === "student")
      .forEach((student) => {
        const classLabel =
          student.classLabel ||
          getClassLabel({
            courseName: student.courseName || student.department,
            yearNumber: student.yearNumber || student.year,
            sectionName: student.sectionName || student.section,
          });

        // Apply filters
        const course = student.courseName || student.department;
        const section = student.sectionName || student.section;

        if (courseFilter !== "all" && course !== courseFilter) return;
        if (sectionFilter !== "all" && section !== sectionFilter) return;

        if (!groups.has(classLabel)) {
          groups.set(classLabel, []);
        }
        groups.get(classLabel).push(student);
      });

    return Array.from(groups.entries())
      .map(([classLabel, studentsInClass]) => ({
        classLabel,
        totalStudents: studentsInClass.length,
        students: studentsInClass.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel));
  }, [users, courseFilter, sectionFilter]);

  // Filter teachers by subject
  const filteredTeachers = useMemo(() => {
    if (roleFilter !== "student") {
      if (teacherSubjectFilter === "all") return users.filter((u) => u.role === "teacher");
      return users.filter((user) => {
        if (user.role !== "teacher") return false;
        if (!Array.isArray(user.subjects)) return false;
        return user.subjects.some((s) => {
          const subjectName = s.name || s;
          return subjectName === teacherSubjectFilter;
        });
      });
    }
    return [];
  }, [users, roleFilter, teacherSubjectFilter]);

  useEffect(() => {
    const user = getStoredUser();
    if (!user || user.role !== "admin") {
      navigate("/", { replace: true });
      return;
    }
    setAdmin(user);
  }, [navigate]);

  useEffect(() => {
    loadSubjects();
    loadClasses();
  }, []);

  useEffect(() => {
    if (!admin?.id) return;
    loadUsers(roleFilter);
    loadSummary();
    loadSessionLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, roleFilter]);

  const loadUsers = async (roleValue) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchManagedUsers({
        adminId: admin.id,
        role: roleValue === "all" ? undefined : roleValue,
      });
      setUsers(data.users || []);
      if (data.message) setMessage(data.message);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const data = await getSystemSummary();
      setSystemSummary({
        totalStudents: data.totalStudents || 0,
        totalTeachers: data.totalTeachers || 0,
        totalSessions: data.totalSessions || 0,
        totalAttendanceRecords: data.totalAttendanceRecords || 0,
      });
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const loadSessionLog = async () => {
    setLogLoading(true);
    try {
      const data = await getSessionLog();
      setSessionLog(data.log || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLogLoading(false);
    }
  };

  const loadSubjects = async () => {
    try {
      const data = await fetchSubjects();
      setSubjects(data.subjects || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const loadClasses = async () => {
    try {
      const data = await fetchClasses();
      setClasses(data.classes || []);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleSubjectAdd = async (event) => {
    event.preventDefault();
    if (!admin?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await createSubject({
        adminId: admin.id,
        name: subjectName,
        department: subjectDept,
        year: Number(subjectYear),
      });
      setMessage("Subject created.");
      setSubjectName("");
      setSubjectYear("1");
      await loadSubjects();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubjectDelete = async (subjectId) => {
    if (!admin?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await deleteSubject(subjectId, admin.id);
      setMessage("Subject deleted.");
      await loadSubjects();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearAllAuth();
    navigate("/", { replace: true });
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "role" && value === "student") {
        if (!next.sectionId && classes.length > 0) {
          next.sectionId = String(classes[0].sectionId);
        }
      }
      return next;
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingUserId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!admin?.id) return;

    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      adminId: admin.id,
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      department: form.role === "teacher" ? form.department?.trim() || "BCA" : undefined,
      year: form.role === "teacher" && form.year ? Number(form.year) : undefined,
      section:
        form.role === "teacher" && form.section
          ? form.section.trim().toUpperCase()
          : undefined,
      sectionId: form.role === "student" ? form.sectionId || undefined : undefined,
      // send comma separated subjects, backend will create/resolve subject ids
      subjects: form.role === "teacher" ? form.subjects : "",
    };

    try {
      if (editingUserId) {
        await updateManagedUser(editingUserId, payload);
        setMessage("User updated successfully.");
      } else {
        await createManagedUser(payload);
        setMessage("User added successfully.");
      }

      resetForm();
      await loadUsers(roleFilter);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (userId) => {
    if (!admin?.id) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await toggleUserActive(userId, { adminId: admin.id });
      setMessage("User status updated.");
      await loadUsers(roleFilter);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id);
    // Normalize subjects to a readable comma-separated string for the text input.
    const subjectsText = Array.isArray(user.subjects)
      ? user.subjects
          .map((s) => (s && s.name ? s.name : s))
          .filter(Boolean)
          .join(", ")
      : "";

    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      role: user.role || "teacher",
      department: user.department || "BCA",
      year: user.year ? String(user.year) : "",
      section: user.section ? String(user.section).toUpperCase() : "",
      sectionId: user.sectionId ? String(user.sectionId) : "",
      subjects: subjectsText,
    });
    setMessage("");
    setError("");
  };

  const handleDelete = async (userId) => {
    if (!admin?.id) return;
    if (!window.confirm("Delete this user? This cannot be undone.")) {
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await deleteManagedUser(userId, { adminId: admin.id });
      setMessage("User deleted.");
      await loadUsers(roleFilter);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };


  return (
    <section className="card">
      <div className="row-between">
        <h2>Admin Dashboard</h2>
        <button type="button" className="secondary-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <p className="muted">Manage teachers and students. Logged in as: {admin?.name}</p>

      <div className="card-grid top-stats">
        <div className="mini-card hover-card">
          <p className="muted">Students</p>
          <h3>{systemSummary.totalStudents}</h3>
        </div>
        <div className="mini-card hover-card">
          <p className="muted">Teachers</p>
          <h3>{systemSummary.totalTeachers}</h3>
        </div>
        <div className="mini-card hover-card">
          <p className="muted">Sessions</p>
          <h3>{systemSummary.totalSessions}</h3>
        </div>
        <div className="mini-card hover-card">
          <p className="muted">Attendance Records</p>
          <h3>{systemSummary.totalAttendanceRecords}</h3>
        </div>
      </div>

      <div className="filter-row">
        <label htmlFor="roleFilter">Filter role:</label>
        <select
          id="roleFilter"
          value={roleFilter}
          onChange={(event) => {
            setRoleFilter(event.target.value);
            setCourseFilter("all");
            setSectionFilter("all");
            setTeacherSubjectFilter("all");
          }}
        >
          <option value="all">All</option>
          <option value="teacher">Teachers</option>
          <option value="student">Students</option>
        </select>

        {roleFilter !== "teacher" && (
          <>
            <label htmlFor="courseFilter">Filter course:</label>
            <select
              id="courseFilter"
              value={courseFilter}
              onChange={(event) => setCourseFilter(event.target.value)}
            >
              <option value="all">All Courses</option>
              {courseAndSectionOptions.courses.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>

            <label htmlFor="sectionFilter">Filter section:</label>
            <select
              id="sectionFilter"
              value={sectionFilter}
              onChange={(event) => setSectionFilter(event.target.value)}
            >
              <option value="all">All Sections</option>
              {courseAndSectionOptions.sections.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </>
        )}

        {roleFilter !== "student" && (
          <>
            <label htmlFor="teacherSubjectFilter">Filter subject:</label>
            <select
              id="teacherSubjectFilter"
              value={teacherSubjectFilter}
              onChange={(event) => setTeacherSubjectFilter(event.target.value)}
            >
              <option value="all">All Subjects</option>
              {teacherSubjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <form className="admin-form" onSubmit={handleSubmit}>
        <h3>{roleLabel}</h3>

        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          value={form.name}
          onChange={handleInputChange}
          required
        />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleInputChange}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleInputChange}
          placeholder={editingUserId ? "Leave blank to keep current password" : ""}
          required={!editingUserId}
        />

        <label htmlFor="role">Role</label>
        <select id="role" name="role" value={form.role} onChange={handleInputChange}>
          <option value="teacher">Teacher</option>
          <option value="student">Student</option>
        </select>

        {form.role === "student" ? (
          <>
            <label htmlFor="sectionId">Class</label>
            <select
              id="sectionId"
              name="sectionId"
              value={form.sectionId}
              onChange={handleInputChange}
              required
            >
              <option value="">Select class</option>
              {classes.map((classItem) => (
                <option key={classItem.sectionId} value={classItem.sectionId}>
                  {classItem.classLabel}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <label htmlFor="department">Department</label>
            <input
              id="department"
              name="department"
              type="text"
              value={form.department}
              onChange={handleInputChange}
              placeholder="e.g., BCA"
            />

            <label htmlFor="year">Year</label>
            <select
              id="year"
              name="year"
              value={form.year}
              onChange={handleInputChange}
            >
              <option value="">Select year</option>
              <option value="1">Year 1</option>
              <option value="2">Year 2</option>
              <option value="3">Year 3</option>
            </select>

            <label htmlFor="section">Section</label>
            <input
              id="section"
              name="section"
              type="text"
              value={form.section}
              onChange={handleInputChange}
              placeholder="e.g., A"
              maxLength={2}
            />
          </>
        )}

        {form.role === "teacher" ? (
          <>
            <label htmlFor="subjects">Subjects (comma separated)</label>
            <input
              id="subjects"
              name="subjects"
              type="text"
              value={form.subjects}
              onChange={handleInputChange}
              placeholder="e.g., DBMS, MIS"
            />
          </>
        ) : null}

        <div className="button-row">
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : roleLabel}
          </button>
          {editingUserId ? (
            <button type="button" className="secondary-btn" onClick={resetForm}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <h3>Users</h3>
      {loading ? <p className="muted">Loading users...</p> : null}

      {roleFilter === "teacher"
        ? filteredTeachers.length === 0 && !loading
          ? <p className="muted">No teachers found.</p>
          : null
        : users.length === 0 && !loading
        ? <p className="muted">No users found.</p>
        : null}

      {(roleFilter === "teacher" ? filteredTeachers : users).length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Class</th>
                <th>Status</th>
                <th>Subjects</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(roleFilter === "teacher" ? filteredTeachers : users).map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td className="capitalize">{user.role}</td>
                  <td>
                    {user.role === "student"
                      ? user.classLabel ||
                        getClassLabel({
                          courseName: user.courseName || user.department,
                          yearNumber: user.yearNumber || user.year,
                          sectionName: user.sectionName || user.section,
                        })
                      : "-"}
                  </td>
                  <td>
                    <span className={`badge ${user.isActive ? "good" : "warn"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    {Array.isArray(user.subjects) && user.subjects.length > 0
                      ? user.subjects
                          .map((s) => {
                            if (s.name) return s.name;
                            const found = subjects.find((subj) => String(subj._id) === String(s));
                            return found ? found.name : "";
                          })
                          .filter(Boolean)
                          .join(", ")
                      : "-"}
                  </td>
                  <td className="button-cell">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleEdit(user)}
                      disabled={saving}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => handleToggleActive(user.id)}
                      disabled={saving}
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => handleDelete(user.id)}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="summary-card" id="student-groups">
        <h3>📚 Students By Class</h3>
        {studentGroups.length === 0 ? (
          <p className="muted">No students to group yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Count</th>
                  <th>Student Names</th>
                </tr>
              </thead>
              <tbody>
                {studentGroups.map((group) => (
                  <tr key={group.classLabel}>
                    <td><strong>{group.classLabel}</strong></td>
                    <td><span className="badge good">{group.totalStudents}</span></td>
                    <td>{group.students.map((student) => student.name).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="summary-card" id="teacher-groups">
        <h3>👨‍🏫 Teachers By Subject</h3>
        {users.filter((u) => u.role === "teacher").length === 0 ? (
          <p className="muted">No teachers found.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teacher Name</th>
                  <th>Email</th>
                  <th>Assigned Subjects</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter((u) => u.role === "teacher")
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((teacher) => (
                    <tr key={teacher.id}>
                      <td><strong>{teacher.name}</strong></td>
                      <td>{teacher.email}</td>
                      <td>
                        {Array.isArray(teacher.subjects) && teacher.subjects.length > 0
                          ? teacher.subjects
                              .map((s) => {
                                if (s.name) return s.name;
                                const found = subjects.find(
                                  (subj) => String(subj._id) === String(s)
                                );
                                return found ? found.name : "";
                              })
                              .filter(Boolean)
                              .join(", ")
                          : <span className="muted">No subjects assigned</span>}
                      </td>
                      <td>
                        <span className={`badge ${teacher.isActive ? "good" : "warn"}`}>
                          {teacher.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="summary-card" id="session-log">
        <h3>Session Log</h3>
        {logLoading ? <p className="muted">Loading session log...</p> : null}
        {!logLoading && sessionLog.length === 0 ? <p className="muted">No sessions yet.</p> : null}
        {!logLoading && sessionLog.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Subject</th>
                  <th>Class</th>
                  <th>Teacher</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {sessionLog.map((item) => (
                  <tr key={item.sessionId}>
                    <td>{item.sessionId}</td>
                    <td>{item.subject}</td>
                    <td>
                      {item.classLabel ||
                        getClassLabel({
                          courseName: item.department,
                          yearNumber: item.year,
                          sectionName: item.section,
                        })}
                    </td>
                    <td>{item.teacherName || "-"}</td>
                    <td>{item.startTime ? new Date(item.startTime).toLocaleString() : "-"}</td>
                    <td>{item.endTime ? new Date(item.endTime).toLocaleString() : "Active"}</td>
                    <td>{item.totalAttendance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="summary-card" id="subjects">
        <h3>Manage Subjects</h3>
        <form className="admin-form" onSubmit={handleSubjectAdd}>
          <label htmlFor="subjectName">Subject Name</label>
          <input
            id="subjectName"
            type="text"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            required
          />

          <label htmlFor="subjectDept">Department</label>
          <input
            id="subjectDept"
            type="text"
            value={subjectDept}
            onChange={(e) => setSubjectDept(e.target.value)}
          />

          <label htmlFor="subjectYear">Year</label>
          <select
            id="subjectYear"
            value={subjectYear}
            onChange={(e) => setSubjectYear(e.target.value)}
          >
            <option value="1">Year 1</option>
            <option value="2">Year 2</option>
            <option value="3">Year 3</option>
          </select>

          <div className="button-row">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Add Subject"}
            </button>
          </div>
        </form>

        {subjects.length === 0 ? <p className="muted">No subjects yet.</p> : null}
        {subjects.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Year</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subj) => (
                  <tr key={subj._id}>
                    <td>{subj.name}</td>
                    <td>{subj.department}</td>
                    <td>{subj.year ?? "-"}</td>
                    <td className="button-cell">
                      <button
                        type="button"
                        className="danger-btn"
                        disabled={saving}
                        onClick={() => handleSubjectDelete(subj._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default AdminDashboard;
