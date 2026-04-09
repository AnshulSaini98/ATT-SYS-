const {
  User,
  Session,
  Attendance,
  Subject,
  TeacherAssignment,
  Section,
  Course,
  Year,
} = require("../models");
const {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  isValidObjectId,
  normalizeEmail,
  ensureAcademicHierarchy,
  resolveHierarchyFromSectionId,
  applyHierarchyToStudent,
  getClassLabel,
} = require("../utils");

const ALLOWED_MANAGE_ROLES = ["teacher", "student"];
const ALLOWED_YEARS = new Set([1, 2, 3]);

const normalizeDepartment = (value) => String(value || "BCA").trim() || "BCA";
const normalizeSection = (value) => String(value || "").trim().toUpperCase();
const parseYear = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === "") return fallback;
  const year = Number(value);
  return Number.isFinite(year) ? year : NaN;
};

const ensureCourseYearMapping = async ({ department, year }) => {
  const normalizedDepartment = normalizeDepartment(department);
  const normalizedYear = parseYear(year);
  if (!ALLOWED_YEARS.has(normalizedYear)) {
    return null;
  }

  const course = await Course.findOneAndUpdate(
    { name: normalizedDepartment },
    { $setOnInsert: { name: normalizedDepartment } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const yearDoc = await Year.findOneAndUpdate(
    { courseId: course._id, yearNumber: normalizedYear },
    { $setOnInsert: { courseId: course._id, yearNumber: normalizedYear } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    courseId: course._id,
    yearId: yearDoc._id,
    courseName: course.name,
    yearNumber: yearDoc.yearNumber,
  };
};

// Small helper to ensure only admins can perform user management actions.
const fetchAdminOrFail = async (adminId) => {
  if (!adminId || !isValidObjectId(adminId)) {
    return { error: { status: 400, message: "Invalid adminId." } };
  }

  const admin = await User.findById(adminId);
  if (!admin) {
    return { error: { status: 404, message: "Admin not found." } };
  }

  if (admin.role !== "admin") {
    return { error: { status: 403, message: "Only admins can manage users." } };
  }

  return { admin };
};

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  courseId: user.courseId?._id || user.courseId,
  yearId: user.yearId?._id || user.yearId,
  sectionId: user.sectionId?._id || user.sectionId,
  courseName: user.courseId?.name || user.department,
  yearNumber: user.yearId?.yearNumber || user.year,
  sectionName: user.sectionId?.name || user.section,
  classLabel: getClassLabel({
    courseName: user.courseId?.name || user.department,
    yearNumber: user.yearId?.yearNumber || user.year,
    sectionName: user.sectionId?.name || user.section,
  }),
  department: user.department,
  year: user.year,
  section: user.section,
  subjects: user.subjects,
  isActive: user.isActive,
});

// Resolve subject inputs (ids or comma-separated text) into Subject ObjectIds.
const resolveSubjectIds = async ({ subjectIds, subjectsText, department, year }) => {
  const collected = new Set();
  const normalizedDepartment = normalizeDepartment(department);
  const resolvedYear = parseYear(year, 1);
  const normalizedYear = ALLOWED_YEARS.has(resolvedYear) ? resolvedYear : 1;
  const courseYear = await ensureCourseYearMapping({
    department: normalizedDepartment,
    year: normalizedYear,
  });
  const subjectScope = courseYear?.yearId
    ? { yearId: courseYear.yearId }
    : { department: normalizedDepartment, year: normalizedYear };

  // From ids
  if (Array.isArray(subjectIds)) {
    subjectIds.filter(isValidObjectId).forEach((id) => collected.add(String(id)));
  }

  // From comma-separated text: create or reuse subjects
  if (typeof subjectsText === "string" && subjectsText.trim() !== "") {
    const names = subjectsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length > 0) {
      const existing = await Subject.find({
        name: { $in: names },
        ...subjectScope,
      });
      const existingMap = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
      for (const name of names) {
        const found = existingMap.get(name.toLowerCase());
        if (found) {
          collected.add(String(found._id));
        } else {
          const created = await Subject.create({
            name,
            department: courseYear?.courseName || normalizedDepartment,
            year: courseYear?.yearNumber || normalizedYear,
            yearId: courseYear?.yearId,
          });
          collected.add(String(created._id));
        }
      }
    }
  }

  return Array.from(collected);
};

const listUsers = async (req, res) => {
  try {
    // Use authenticated user's ID from JWT, fallback to query param for backward compatibility
    const adminId = req.user ? req.user.id : req.query.adminId;
    const { role } = req.query;

    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    const query = { role: { $in: ALLOWED_MANAGE_ROLES } };
    if (role && ALLOWED_MANAGE_ROLES.includes(role)) {
      query.role = role;
    }

    let users = [];
    try {
      users = await User.find(query)
        .sort({ name: 1 })
        .populate("subjects", "name department year yearId")
        .populate("courseId", "name")
        .populate("yearId", "yearNumber courseId")
        .populate("sectionId", "name yearId")
        .lean();
    } catch (populateError) {
      // Fallback for legacy string subjects to keep admin list working.
      users = await User.find(query).sort({ name: 1 }).lean();
    }

    return sendSuccess(res, 200, "Users fetched successfully.", {
      users: users.map(sanitizeUser),
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch users.", error);
  }
};

// List all classes (Course -> Year -> Section) with class labels for admin UI.
const listClasses = async (req, res) => {
  try {
    const adminId = req.user ? req.user.id : req.query.adminId;
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    const sections = await Section.find({})
      .populate({
        path: "yearId",
        select: "yearNumber courseId",
        populate: {
          path: "courseId",
          select: "name",
        },
      })
      .lean();

    const sectionIds = sections.map((section) => section._id);
    const studentCountsAgg = await User.aggregate([
      { $match: { role: "student", sectionId: { $in: sectionIds } } },
      { $group: { _id: "$sectionId", totalStudents: { $sum: 1 } } },
    ]);
    const countMap = new Map(
      studentCountsAgg.map((row) => [String(row._id), row.totalStudents || 0])
    );

    const classes = sections
      .map((section) => {
        const courseName = section?.yearId?.courseId?.name;
        const yearNumber = section?.yearId?.yearNumber;
        const sectionName = section?.name;
        const classLabel = getClassLabel({ courseName, yearNumber, sectionName });
        return {
          sectionId: section._id,
          yearId: section?.yearId?._id,
          courseId: section?.yearId?.courseId?._id,
          courseName,
          yearNumber,
          sectionName,
          classLabel,
          totalStudents: countMap.get(String(section._id)) || 0,
        };
      })
      .filter((item) => item.classLabel !== "Unknown Class")
      .sort((a, b) => a.classLabel.localeCompare(b.classLabel));

    return sendSuccess(res, 200, "Classes fetched.", { classes });
  } catch (error) {
    return sendServerError(res, "Could not fetch classes.", error);
  }
};

const createUser = async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body, ["name", "email", "password", "role"]);
    if (missingFields.length > 0) {
      return sendError(res, 400, "name, email, password, and role are required.");
    }

    // Use authenticated user's ID from JWT, fallback to request body for backward compatibility
    const adminId = req.user ? req.user.id : req.body.adminId;
    const { name, password, subjectIds, subjects: subjectsText } = req.body;
    const normalizedEmail = normalizeEmail(req.body.email);
    const requestedRole = String(req.body.role).trim().toLowerCase();
    const department = normalizeDepartment(req.body.department);
    const year = parseYear(req.body.year);
    const section = normalizeSection(req.body.section);
    const requestedSectionId = req.body.sectionId;

    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    if (!ALLOWED_MANAGE_ROLES.includes(requestedRole)) {
      return sendError(res, 400, "Role must be teacher or student.");
    }

    let studentHierarchy = null;
    if (requestedRole === "student") {
      if (requestedSectionId !== undefined && requestedSectionId !== null && requestedSectionId !== "") {
        if (!isValidObjectId(requestedSectionId)) {
          return sendError(res, 400, "sectionId must be a valid ObjectId.");
        }
        studentHierarchy = await resolveHierarchyFromSectionId(requestedSectionId);
        if (!studentHierarchy) {
          return sendError(res, 404, "sectionId does not map to a valid academic hierarchy.");
        }
      } else {
        if (!ALLOWED_YEARS.has(year)) {
          return sendError(res, 400, "Student year is required and must be one of 1, 2, or 3.");
        }
        if (!section) {
          return sendError(res, 400, "Student section is required.");
        }
        studentHierarchy = await ensureAcademicHierarchy({
          courseName: department,
          yearNumber: year,
          sectionName: section,
        });
      }
    } else if (year !== undefined && !ALLOWED_YEARS.has(year)) {
      return sendError(res, 400, "year must be one of 1, 2, or 3.");
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return sendError(res, 409, "Email already registered.");
    }

    const subjectObjectIds =
      requestedRole === "teacher"
        ? await resolveSubjectIds({ subjectIds, subjectsText, department, year })
        : undefined;

    const createdUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: requestedRole,
      department:
        requestedRole === "student" && studentHierarchy
          ? studentHierarchy.courseName
          : department,
      year:
        requestedRole === "student" && studentHierarchy
          ? studentHierarchy.yearNumber
          : year !== undefined
          ? year
          : undefined,
      section:
        requestedRole === "student" && studentHierarchy
          ? studentHierarchy.sectionName
          : section || undefined,
      courseId:
        requestedRole === "student" && studentHierarchy
          ? studentHierarchy.courseId
          : undefined,
      yearId:
        requestedRole === "student" && studentHierarchy
          ? studentHierarchy.yearId
          : undefined,
      sectionId:
        requestedRole === "student" && studentHierarchy
          ? studentHierarchy.sectionId
          : undefined,
      subjects: requestedRole === "teacher" ? subjectObjectIds : undefined,
    });

    return sendSuccess(res, 201, "User created successfully.", {
      user: sanitizeUser(createdUser),
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "Email already registered.");
    }
    return sendServerError(res, "Could not create user.", error);
  }
};

const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user?.id || req.body.adminId;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid userId.");
    }

    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    // Apply only provided fields; keep everything else intact.
    if (req.body.name) {
      user.name = req.body.name.trim();
    }

    if (req.body.email) {
      user.email = normalizeEmail(req.body.email);
    }

    if (req.body.password) {
      user.password = req.body.password;
    }

    if (req.body.role) {
      const newRole = String(req.body.role).trim().toLowerCase();
      if (!ALLOWED_MANAGE_ROLES.includes(newRole)) {
        return sendError(res, 400, "Role must be teacher or student.");
      }
      user.role = newRole;

      // When switching to student, drop subjects to avoid confusion.
      if (newRole !== "teacher") {
        user.subjects = undefined;
      }
    }

    if (req.body.department !== undefined) {
      user.department = normalizeDepartment(req.body.department);
    }

    if (req.body.year !== undefined) {
      const parsedYear = parseYear(req.body.year);
      if (!ALLOWED_YEARS.has(parsedYear)) {
        return sendError(res, 400, "year must be one of 1, 2, or 3.");
      }
      user.year = parsedYear;
    }

    if (req.body.section !== undefined) {
      const normalizedSection = normalizeSection(req.body.section);
      user.section = normalizedSection || undefined;
    }

    if (req.body.sectionId !== undefined) {
      if (!req.body.sectionId || !isValidObjectId(req.body.sectionId)) {
        return sendError(res, 400, "sectionId must be a valid ObjectId.");
      }
      user.sectionId = req.body.sectionId;
    }

    if (user.role === "student") {
      let hierarchy = null;

      if (user.sectionId) {
        hierarchy = await resolveHierarchyFromSectionId(user.sectionId);
      }

      if (!hierarchy && ALLOWED_YEARS.has(user.year) && String(user.section || "").trim()) {
        hierarchy = await ensureAcademicHierarchy({
          courseName: user.department,
          yearNumber: user.year,
          sectionName: user.section,
        });
      }

      if (!hierarchy) {
        return sendError(
          res,
          400,
          "Students must have a valid sectionId or valid department/year/section."
        );
      }

      applyHierarchyToStudent(user, hierarchy);
    } else {
      user.courseId = undefined;
      user.yearId = undefined;
      user.sectionId = undefined;
    }

    if (req.body.subjectIds !== undefined || req.body.subjects !== undefined) {
      const ids = await resolveSubjectIds({
        subjectIds: req.body.subjectIds,
        subjectsText: req.body.subjects,
        department: user.department,
        year: user.year,
      });
      user.subjects = user.role === "teacher" ? ids : undefined;
    }

    await user.save();

    return sendSuccess(res, 200, "User updated successfully.", {
      user: sanitizeUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "Email already registered.");
    }
    return sendServerError(res, "Could not update user.", error);
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user?.id || req.body.adminId;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid userId.");
    }

    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) {
      return sendError(res, 404, "User not found.");
    }

    return sendSuccess(res, 200, "User deleted successfully.", {
      userId: deleted._id,
    });
  } catch (error) {
    return sendServerError(res, "Could not delete user.", error);
  }
};

// Toggle activation status for a user (admin only).
const toggleUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user?.id || req.body.adminId;

    if (!isValidObjectId(userId)) {
      return sendError(res, 400, "Invalid userId.");
    }

    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, "User not found.");
    }

    user.isActive = !user.isActive;
    await user.save();

    return sendSuccess(res, 200, "User status updated.", {
      user: sanitizeUser(user),
    });
  } catch (err) {
    return sendServerError(res, "Could not toggle user.", err);
  }
};

// System-wide counts for dashboard cards.
const systemSummary = async (_req, res) => {
  try {
    const [totalStudents, totalTeachers, totalSessions, totalAttendanceRecords] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "teacher" }),
      Session.countDocuments(),
      Attendance.countDocuments(),
    ]);

    return sendSuccess(res, 200, "System summary fetched.", {
      totalStudents,
      totalTeachers,
      totalSessions,
      totalAttendanceRecords,
    });
  } catch (err) {
    return sendServerError(res, "Could not fetch system summary.", err);
  }
};

// Simple audit log for sessions.
const sessionLog = async (_req, res) => {
  try {
    const sessions = await Session.find({})
      .populate("teacherId", "name")
      .sort({ startTime: -1 })
      .lean();

    const attendanceCounts = await Attendance.aggregate([
      { $group: { _id: "$sessionId", totalAttendance: { $sum: 1 } } },
    ]);
    const attendanceMap = new Map(attendanceCounts.map((item) => [String(item._id), item.totalAttendance]));

    const log = sessions.map((session) => ({
      sessionId: session._id,
      subject: session.subject,
      department: session.department,
      year: session.year,
      section: session.section,
      classLabel: getClassLabel({
        courseName: session.department,
        yearNumber: session.year,
        sectionName: session.section,
      }),
      teacherName: session.teacherId?.name,
      startTime: session.startTime,
      endTime: session.isActive ? null : session.updatedAt,
      totalAttendance: attendanceMap.get(String(session._id)) || 0,
    }));

    return sendSuccess(res, 200, "Session log fetched.", { log });
  } catch (err) {
    return sendServerError(res, "Could not fetch session log.", err);
  }
};

// Create subject
const createSubject = async (req, res) => {
  try {
    const adminId = req.user?.id || req.body.adminId;
    const { name } = req.body;
    const department = normalizeDepartment(req.body.department);
    const year = parseYear(req.body.year, 1);
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }
    if (!name || !String(name).trim()) {
      return sendError(res, 400, "Subject name is required.");
    }
    if (!ALLOWED_YEARS.has(year)) {
      return sendError(res, 400, "Subject year must be one of 1, 2, or 3.");
    }
    const courseYear = await ensureCourseYearMapping({ department, year });
    if (!courseYear?.yearId) {
      return sendError(res, 400, "Could not resolve academic year mapping for this subject.");
    }
    const normalizedName = String(name).trim();
    const existing = await Subject.findOne({
      name: normalizedName,
      yearId: courseYear.yearId,
    });
    if (existing) {
      return sendError(res, 409, "Subject already exists for this department/year.");
    }
    const created = await Subject.create({
      name: normalizedName,
      department: courseYear.courseName,
      year: courseYear.yearNumber,
      yearId: courseYear.yearId,
    });
    return sendSuccess(res, 201, "Subject created.", { subject: created });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 409, "Subject already exists for this department/year.");
    }
    return sendServerError(res, "Could not create subject.", err);
  }
};

// List subjects
const listSubjects = async (_req, res) => {
  try {
    const subjects = await Subject.find({})
      .populate("yearId", "yearNumber courseId")
      .sort({ year: 1, name: 1 })
      .lean();
    return sendSuccess(res, 200, "Subjects fetched.", { subjects });
  } catch (err) {
    return sendServerError(res, "Could not fetch subjects.", err);
  }
};

// Delete subject (admin only). If assigned to teachers, it will be unassigned before deletion.
const deleteSubject = async (req, res) => {
  try {
    const adminId = req.user?.id || req.query.adminId;
    const { subjectId } = req.params;
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }
    if (!isValidObjectId(subjectId)) {
      return sendError(res, 400, "Invalid subjectId.");
    }

    // Unassign this subject from any teachers to avoid dangling refs.
    await User.updateMany({ subjects: subjectId }, { $pull: { subjects: subjectId } });

    const deleted = await Subject.findByIdAndDelete(subjectId);
    if (!deleted) {
      return sendError(res, 404, "Subject not found.");
    }
    return sendSuccess(res, 200, "Subject deleted.", { subjectId: deleted._id });
  } catch (err) {
    return sendServerError(res, "Could not delete subject.", err);
  }
};

// Assign subjects to a teacher
const assignSubjects = async (req, res) => {
  try {
    const adminId = req.user?.id || req.body.adminId;
    const { subjectIds, sections } = req.body;
    const { teacherId } = req.params;
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, "Invalid teacherId.");
    }
    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      return sendError(res, 404, "Teacher not found.");
    }

    const ids = Array.isArray(subjectIds) ? subjectIds : [];
    const validIds = ids.filter(isValidObjectId);
    if (validIds.length !== ids.length) {
      return sendError(res, 400, "All subjectIds must be valid ObjectIds.");
    }

    const subjects = await Subject.find({ _id: { $in: validIds } });
    if (subjects.length !== validIds.length) {
      return sendError(res, 404, "One or more subjects not found.");
    }

    teacher.subjects = validIds;
    await teacher.save();

    const effectiveSections = Array.isArray(sections) && sections.length > 0
      ? [...new Set(sections.map(normalizeSection).filter(Boolean))]
      : teacher.section
      ? [normalizeSection(teacher.section)]
      : ["A", "B"];

    await TeacherAssignment.deleteMany({ teacherId });
    const assignmentRows = [];
    for (const subject of subjects) {
      const subjectYear = Number(subject.year);
      if (!Number.isInteger(subjectYear)) continue;
      for (const section of effectiveSections) {
        const hierarchy = await ensureAcademicHierarchy({
          courseName: normalizeDepartment(subject.department || teacher.department || "BCA"),
          yearNumber: subjectYear,
          sectionName: section,
        });
        assignmentRows.push({
          teacherId: teacher._id,
          subjectId: subject._id,
          department: normalizeDepartment(subject.department || teacher.department || "BCA"),
          courseId: hierarchy?.courseId,
          year: subjectYear,
          yearId: hierarchy?.yearId,
          section,
          sectionId: hierarchy?.sectionId,
          isActive: true,
        });
      }
    }

    if (assignmentRows.length > 0) {
      await TeacherAssignment.insertMany(assignmentRows, { ordered: false });
    }

    return sendSuccess(res, 200, "Subjects assigned.", {
      teacher: sanitizeUser(teacher),
      assignmentsCreated: assignmentRows.length,
      sections: effectiveSections,
    });
  } catch (err) {
    return sendServerError(res, "Could not assign subjects.", err);
  }
};

/**
 * Get detailed attendance history for a specific student.
 * Supports date range filtering and returns all session details.
 */
const getStudentAttendanceHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { startDate, endDate } = req.query;

    if (!isValidObjectId(studentId)) {
      return sendError(res, 400, "Invalid studentId.");
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== "student") {
      return sendError(res, 404, "Student not found.");
    }

    // Build date filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }

    const query = { studentId };
    if (Object.keys(dateFilter).length > 0) {
      query.createdAt = dateFilter;
    }

    // Fetch all attendance records for this student with session details
    const attendanceRecords = await Attendance.find(query)
      .populate({
        path: "sessionId",
        select: "teacherId subject startTime expiresAt",
        populate: {
          path: "teacherId",
          select: "name email",
        },
      })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate attendance summary
    const sessionsBySubject = {};
    const attendedBySubject = {};

    attendanceRecords.forEach((record) => {
      if (!record.sessionId) return;

      const subject = record.sessionId.subject;
      if (!sessionsBySubject[subject]) {
        sessionsBySubject[subject] = 0;
        attendedBySubject[subject] = 0;
      }
      attendedBySubject[subject] += 1;
    });

    // Get all sessions to count total per subject
    const allSessions = await Session.find({})
      .select("subject")
      .lean();
    
    allSessions.forEach((session) => {
      const subject = session.subject;
      if (!sessionsBySubject[subject]) {
        sessionsBySubject[subject] = 0;
      }
      sessionsBySubject[subject] += 1;
    });

    const summaryBySubject = Object.keys(sessionsBySubject).map((subject) => ({
      subject,
      totalSessions: sessionsBySubject[subject],
      attendedSessions: attendedBySubject[subject] || 0,
      attendancePercentage: sessionsBySubject[subject]
        ? Number(((attendedBySubject[subject] || 0) / sessionsBySubject[subject] * 100).toFixed(2))
        : 0,
    }));

    const history = attendanceRecords.map((record) => ({
      sessionId: record.sessionId?._id,
      subject: record.sessionId?.subject,
      teacherName: record.sessionId?.teacherId?.name,
      teacherEmail: record.sessionId?.teacherId?.email,
      sessionStartTime: record.sessionId?.startTime,
      markedAt: record.createdAt,
    }));

    return sendSuccess(res, 200, "Student attendance history fetched.", {
      student: sanitizeUser(student),
      totalRecords: attendanceRecords.length,
      summaryBySubject,
      history,
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch student attendance history.", error);
  }
};

/**
 * Export system attendance report as CSV format string.
 * Returns attendance data for all students with percentage calculations.
 */
const exportAttendanceReport = async (req, res) => {
  try {
    // Fetch all students with attendance data
    const students = await User.find({ role: "student" })
      .select("_id name email")
      .lean();

    if (students.length === 0) {
      return sendSuccess(res, 200, "No students to export", { csv: "" });
    }

    // Fetch all sessions for counting totals per subject
    const sessions = await Session.find({})
      .select("subject")
      .lean();

    const sessionsBySubject = {};
    sessions.forEach((session) => {
      const subject = session.subject;
      sessionsBySubject[subject] = (sessionsBySubject[subject] || 0) + 1;
    });

    // Get all subjects for header
    const subjects = Object.keys(sessionsBySubject).sort();

    // Fetch attendance for all students
    const attendanceByStudent = {};
    const attendanceRecords = await Attendance.find({})
      .populate("sessionId", "subject")
      .lean();

    attendanceRecords.forEach((record) => {
      const studentId = String(record.studentId);
      const subject = record.sessionId?.subject;
      if (!attendanceByStudent[studentId]) {
        attendanceByStudent[studentId] = {};
      }
      attendanceByStudent[studentId][subject] = (attendanceByStudent[studentId][subject] || 0) + 1;
    });

    // Build CSV
    const headers = ["Roll Number", "Student Name", "Email"];
    subjects.forEach((subject) => {
      headers.push(`${subject} Attended`);
      headers.push(`${subject} Percentage`);
    });
    headers.push("Overall Percentage");

    const rows = [headers];

    students.forEach((student) => {
      const studentAttendance = attendanceByStudent[String(student._id)] || {};
      const row = [
        student._id.toString().slice(-6), // Use last 6 chars of ID as roll number
        student.name,
        student.email,
      ];

      let totalAttended = 0;
      let totalSessions = 0;

      subjects.forEach((subject) => {
        const attended = studentAttendance[subject] || 0;
        const total = sessionsBySubject[subject] || 0;
        const percentage = total > 0 ? Number(((attended / total) * 100).toFixed(2)) : 0;

        row.push(attended);
        row.push(percentage);

        totalAttended += attended;
        totalSessions += total;
      });

      const overallPercentage = totalSessions > 0 ? Number(((totalAttended / totalSessions) * 100).toFixed(2)) : 0;
      row.push(overallPercentage);

      rows.push(row);
    });

    // Convert to CSV string
    const csv = rows.map((row) =>
      row
        .map((cell) => {
          // Escape quotes and wrap in quotes if contains comma/newline
          const str = String(cell);
          return str.includes(",") || str.includes("\n") || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ).join("\n");

    // Return CSV as file download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="attendance-report-${new Date().toISOString().split('T')[0]}.csv"`);
    res.status(200).send(csv);
  } catch (error) {
    return sendServerError(res, "Could not export attendance report.", error);
  }
};

/**
 * Get all subjects taught in a specific class (section).
 * Returns subjects with teacher assignments by section.
 */
const getClassSubjects = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const adminId = req.user?.id || req.body.adminId;
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    if (!isValidObjectId(sectionId)) {
      return sendError(res, 400, "Invalid sectionId.");
    }

    const section = await Section.findById(sectionId)
      .populate("yearId", "courseId yearNumber")
      .populate("courseId", "name");
    
    if (!section) {
      return sendError(res, 404, "Section not found.");
    }

    // Get all subjects for this year
    const subjects = await Subject.find({ yearId: section.yearId._id }).lean();
    
    // Get all teacher assignments for this section
    const assignments = await TeacherAssignment.find({
      sectionId,
      isActive: true,
    })
      .populate("teacherId", "name email")
      .lean();

    // Group assignments by subject
    const subjectMap = new Map();
    subjects.forEach((subject) => {
      subjectMap.set(String(subject._id), {
        ...subject,
        teachers: [],
      });
    });

    assignments.forEach((assignment) => {
      const subjectKey = String(assignment.subjectId);
      if (subjectMap.has(subjectKey)) {
        subjectMap.get(subjectKey).teachers.push({
          teacherId: assignment.teacherId._id,
          teacherName: assignment.teacherId.name,
          teacherEmail: assignment.teacherId.email,
        });
      }
    });

    const classLabel = section.name ? `${section.courseId.name} Year ${section.yearId.yearNumber} - Section ${section.name}` : "Unknown";

    return sendSuccess(res, 200, "Class subjects fetched.", {
      classLabel,
      sectionId: section._id,
      yearId: section.yearId._id,
      courseId: section.courseId._id,
      courseName: section.courseId.name,
      yearNumber: section.yearId.yearNumber,
      sectionName: section.name,
      totalSubjects: subjects.length,
      subjects: Array.from(subjectMap.values()),
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch class subjects.", error);
  }
};

/**
 * Get all teachers assigned to a specific class with their subjects.
 */
const getClassTeachers = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const adminId = req.user?.id || req.body.adminId;
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    if (!isValidObjectId(sectionId)) {
      return sendError(res, 400, "Invalid sectionId.");
    }

    const section = await Section.findById(sectionId)
      .populate("yearId", "courseId yearNumber")
      .populate("courseId", "name");
    
    if (!section) {
      return sendError(res, 404, "Section not found.");
    }

    // Get all teacher assignments for this section
    const assignments = await TeacherAssignment.find({
      sectionId,
      isActive: true,
    })
      .populate("teacherId", "name email department")
      .populate("subjectId", "name")
      .lean();

    // Group by teacher
    const teacherMap = new Map();
    assignments.forEach((assignment) => {
      const teacherId = String(assignment.teacherId._id);
      if (!teacherMap.has(teacherId)) {
        teacherMap.set(teacherId, {
          teacherId: assignment.teacherId._id,
          teacherName: assignment.teacherId.name,
          teacherEmail: assignment.teacherId.email,
          department: assignment.teacherId.department,
          subjects: [],
        });
      }
      teacherMap.get(teacherId).subjects.push({
        subjectId: assignment.subjectId._id,
        subjectName: assignment.subjectId.name,
      });
    });

    const classLabel = section.name ? `${section.courseId.name} Year ${section.yearId.yearNumber} - Section ${section.name}` : "Unknown";

    return sendSuccess(res, 200, "Class teachers fetched.", {
      classLabel,
      sectionId: section._id,
      yearId: section.yearId._id,
      courseId: section.courseId._id,
      totalTeachers: teacherMap.size,
      teachers: Array.from(teacherMap.values()),
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch class teachers.", error);
  }
};

/**
 * Assign subjects to a specific class/section.
 * Teachers in that section get these subjects.
 */
const assignSubjectsToClass = async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { subjectIds, teacherIds } = req.body;
    const adminId = req.user?.id || req.body.adminId;
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    if (!isValidObjectId(sectionId)) {
      return sendError(res, 400, "Invalid sectionId.");
    }

    const section = await Section.findById(sectionId)
      .populate("yearId", "courseId yearNumber")
      .populate("courseId", "name");
    
    if (!section) {
      return sendError(res, 404, "Section not found.");
    }

    // Validate subject IDs
    const ids = Array.isArray(subjectIds) ? subjectIds : [];
    const validIds = ids.filter(isValidObjectId);
    if (validIds.length !== ids.length) {
      return sendError(res, 400, "All subjectIds must be valid ObjectIds.");
    }

    const subjects = await Subject.find({ _id: { $in: validIds } }).lean();
    if (subjects.length !== validIds.length) {
      return sendError(res, 404, "One or more subjects not found.");
    }

    // Get teachers to assign (either specified teachers or all teachers in section)
    let teachersToAssign;
    if (Array.isArray(teacherIds) && teacherIds.length > 0) {
      const validTeacherIds = teacherIds.filter(isValidObjectId);
      teachersToAssign = await User.find({
        _id: { $in: validTeacherIds },
        role: "teacher",
      }).lean();
    } else {
      // Get all teachers currently teaching in this section
      const assignments = await TeacherAssignment.find({ sectionId, isActive: true })
        .distinct("teacherId");
      teachersToAssign = await User.find({
        _id: { $in: assignments },
        role: "teacher",
      }).lean();
    }

    if (teachersToAssign.length === 0) {
      return sendError(res, 404, "No teachers found for this section.");
    }

    // Create/update teacher assignments
    const assignmentRows = [];
    for (const subject of subjects) {
      for (const teacher of teachersToAssign) {
        assignmentRows.push({
          teacherId: teacher._id,
          subjectId: subject._id,
          department: normalizeDepartment(subject.department || teacher.department || "BCA"),
          courseId: section.courseId._id,
          year: section.yearId.yearNumber,
          yearId: section.yearId._id,
          section: section.name,
          sectionId: section._id,
          isActive: true,
        });
      }
    }

    // Upsert assignments (avoid duplicates)
    const bulkOps = assignmentRows.map((row) => ({
      updateOne: {
        filter: {
          teacherId: row.teacherId,
          subjectId: row.subjectId,
          sectionId: row.sectionId,
        },
        update: { $set: row },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      await TeacherAssignment.bulkWrite(bulkOps);
    }

    const classLabel = section.name ? `${section.courseId.name} Year ${section.yearId.yearNumber} - Section ${section.name}` : "Unknown";

    return sendSuccess(res, 200, "Subjects assigned to class.", {
      classLabel,
      teachersUpdated: teachersToAssign.length,
      subjectsAssigned: subjects.length,
      totalAssignments: assignmentRows.length,
    });
  } catch (error) {
    return sendServerError(res, "Could not assign subjects to class.", error);
  }
};

/**
 * Get all subjects for a specific year.
 */
const getYearSubjects = async (req, res) => {
  try {
    const { yearId } = req.params;
    const adminId = req.user?.id || req.body.adminId;
    const { error } = await fetchAdminOrFail(adminId);
    if (error) {
      return sendError(res, error.status, error.message);
    }

    if (!isValidObjectId(yearId)) {
      return sendError(res, 400, "Invalid yearId.");
    }

    const year = await Year.findById(yearId)
      .populate("courseId", "name");
    
    if (!year) {
      return sendError(res, 404, "Year not found.");
    }

    const subjects = await Subject.find({ yearId }).lean();

    return sendSuccess(res, 200, "Year subjects fetched.", {
      yearId: year._id,
      courseId: year.courseId._id,
      courseName: year.courseId.name,
      yearNumber: year.yearNumber,
      totalSubjects: subjects.length,
      subjects,
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch year subjects.", error);
  }
};

module.exports = {
  listUsers,
  listClasses,
  createUser,
  updateUser,
  deleteUser,
  toggleUser,
  systemSummary,
  sessionLog,
  createSubject,
  listSubjects,
  deleteSubject,
  assignSubjects,
  getClassSubjects,
  getClassTeachers,
  assignSubjectsToClass,
  getYearSubjects,
  getStudentAttendanceHistory,
  exportAttendanceReport,
};
