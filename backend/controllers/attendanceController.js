const { Attendance, Session, User, Subject } = require("../models");
const {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  isValidObjectId,
  calculatePercentage,
  hasRole,
  resolveStudentHierarchy,
  applyHierarchyToStudent,
  getClassLabel,
} = require("../utils");

const normalizeDepartment = (value) => String(value || "").trim().toLowerCase();
const normalizeSection = (value) => String(value || "").trim().toUpperCase();

const hasSessionClassScope = (session) =>
  Boolean(
    session &&
      (session.sectionId ||
        session.department ||
        (session.year !== undefined && session.year !== null) ||
        session.section)
  );

const buildSessionStudentQuery = (session) => {
  const query = { role: "student" };
  if (session?.sectionId) {
    query.sectionId = session.sectionId;
    return query;
  }
  if (session?.department) {
    query.department = session.department;
  }
  if (session?.year !== undefined && session?.year !== null) {
    query.year = Number(session.year);
  }
  if (session?.section) {
    query.section = normalizeSection(session.section);
  }
  return query;
};

const ensureStudentAcademicMapping = async (studentDoc) => {
  if (!studentDoc) return null;
  const hierarchy = await resolveStudentHierarchy(studentDoc, { autoCreate: true });
  if (!hierarchy) return null;

  const needsUpdate =
    String(studentDoc.sectionId || "") !== String(hierarchy.sectionId) ||
    String(studentDoc.yearId || "") !== String(hierarchy.yearId) ||
    String(studentDoc.courseId || "") !== String(hierarchy.courseId) ||
    normalizeSection(studentDoc.section) !== hierarchy.sectionName ||
    Number(studentDoc.year) !== Number(hierarchy.yearNumber) ||
    String(studentDoc.department || "").trim() !== String(hierarchy.courseName || "").trim();

  if (needsUpdate) {
    applyHierarchyToStudent(studentDoc, hierarchy);
    if (typeof studentDoc.save === "function") {
      await studentDoc.save();
    }
  }

  return hierarchy;
};

const validateStudentClassForSession = (student, session) => {
  if (!hasSessionClassScope(session)) {
    return null;
  }

  const sessionSectionId = session.sectionId ? String(session.sectionId) : "";
  const studentSectionId = student.sectionId ? String(student.sectionId) : "";
  if (sessionSectionId) {
    if (!studentSectionId) {
      return "Your profile is missing section mapping. Contact admin.";
    }
    if (studentSectionId !== sessionSectionId) {
      return "You are not authorized for this section.";
    }
    return null;
  }

  const sessionDepartment = normalizeDepartment(session.department);
  const studentDepartment = normalizeDepartment(student.department);
  const sessionYearExists = session.year !== undefined && session.year !== null;
  const studentYearExists = student.year !== undefined && student.year !== null;
  const sessionYear = Number(session.year);
  const studentYear = Number(student.year);
  const sessionSection = normalizeSection(session.section);
  const studentSection = normalizeSection(student.section);

  if (sessionDepartment && !studentDepartment) {
    return "Your profile is missing department. Contact admin.";
  }
  if (sessionYearExists && !studentYearExists) {
    return "Your profile is missing year. Contact admin.";
  }
  if (sessionSection && !studentSection) {
    return "Your profile is missing section. Contact admin.";
  }

  if (sessionDepartment && studentDepartment !== sessionDepartment) {
    return "You are not authorized for this session's department.";
  }
  if (sessionYearExists && studentYear !== sessionYear) {
    return "You are not authorized for this session's year.";
  }
  if (sessionSection && studentSection !== sessionSection) {
    return "You are not authorized for this session's section.";
  }

  return null;
};

const isSessionExpired = (session) => {
  if (!session?.expiresAt) return true;
  const expiry = new Date(session.expiresAt);
  if (Number.isNaN(expiry.getTime())) return true;
  return new Date() > expiry;
};

const deactivateSessionIfExpired = async (session) => {
  if (!session || !session.isActive) return;
  if (!isSessionExpired(session)) return;
  session.isActive = false;
  await session.save();
};

const markAttendance = async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body, ["sessionToken"]);
    if (missingFields.length > 0) {
      return sendError(res, 400, "sessionToken is required.");
    }

    const studentId = req.user?.id;
    const sessionToken = String(req.body.sessionToken).trim();

    if (!studentId || !isValidObjectId(studentId)) {
      return sendError(res, 401, "Invalid authenticated student.");
    }

    const student = await User.findById(studentId);
    if (!student) {
      return sendError(res, 404, "Student not found.");
    }

    if (!hasRole(student, "student")) {
      return sendError(res, 403, "Only students can mark attendance.");
    }

    if (student.isActive === false) {
      return sendError(res, 403, "Account is deactivated. Please contact admin.");
    }

    const studentHierarchy = await ensureStudentAcademicMapping(student);
    if (!studentHierarchy) {
      return sendError(res, 400, "Student profile is missing academic hierarchy mapping.");
    }

    const session = await Session.findOne({ sessionToken });
    if (!session) {
      return sendError(res, 404, "Invalid session token.");
    }

    // CRITICAL VALIDATION: Student must belong to session's section
    const sessionSectionId = session.sectionId ? String(session.sectionId) : "";
    const studentSectionId = student.sectionId ? String(student.sectionId) : "";

    if (sessionSectionId && studentSectionId !== sessionSectionId) {
      return sendError(res, 403, "You are not authorized for this session's section.");
    }

    const classMismatchMessage = validateStudentClassForSession(student, session);
    if (classMismatchMessage) {
      return sendError(res, 403, classMismatchMessage);
    }

    // Server-side expiry enforcement.
    if (isSessionExpired(session)) {
      await deactivateSessionIfExpired(session);
      return sendError(res, 401, "Session has expired. Attendance marking window has closed.");
    }

    if (!session.isActive) {
      return sendError(res, 400, "Session is not active.");
    }

    // Extra query before insert gives clearer response than raw duplicate DB error.
    const existingAttendance = await Attendance.findOne({
      studentId,
      sessionId: session._id,
    });

    if (existingAttendance) {
      return sendError(res, 409, "Attendance already marked.");
    }

    const attendance = await Attendance.create({
      studentId,
      sessionId: session._id,
    });

    return sendSuccess(res, 201, "Attendance marked successfully.", {
      studentName: student.name,
      subject: session.subject,
      timestamp: attendance.timestamp,
      // Expose sessionId so the frontend can pull live summary data (used for risk/progress UI).
      sessionId: session._id,
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "Attendance already marked.");
    }

    return sendServerError(res, "Could not mark attendance.", error);
  }
};

const getSessionAttendanceSummary = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!isValidObjectId(sessionId)) {
      return sendError(res, 400, "Invalid sessionId.");
    }

    const session = await Session.findById(sessionId).select(
      "teacherId subject isActive startTime department courseId year yearId section sectionId"
    );
    if (!session) {
      return sendError(res, 404, "Session not found.");
    }

    if (req.user?.role === "teacher" && String(session.teacherId) !== String(req.user.id)) {
      return sendError(res, 403, "You can only view attendance for your own sessions.");
    }

    // Student-safe view: never expose other students' roster data.
    if (req.user?.role === "student") {
      const requesterStudent = await User.findById(req.user.id)
        .select("name email role department year section courseId yearId sectionId");
      if (!requesterStudent || requesterStudent.role !== "student") {
        return sendError(res, 403, "Only students can access this view.");
      }

      const studentHierarchy = await ensureStudentAcademicMapping(requesterStudent);
      if (!studentHierarchy) {
        return sendError(res, 400, "Student profile is missing academic hierarchy mapping.");
      }

      const classMismatchMessage = validateStudentClassForSession(requesterStudent, session);
      if (classMismatchMessage) {
        return sendError(res, 403, classMismatchMessage);
      }

      const [totalStudents, totalPresent, attendanceRecord] = await Promise.all([
        User.countDocuments(buildSessionStudentQuery(session)),
        Attendance.countDocuments({ sessionId }),
        Attendance.findOne({
          sessionId,
          studentId: requesterStudent._id,
        })
          .select("_id")
          .lean(),
      ]);

      const totalAbsent = Math.max(totalStudents - totalPresent, 0);
      const attendancePercentage = calculatePercentage(totalPresent, totalStudents);

      return sendSuccess(res, 200, "Session attendance summary fetched.", {
        sessionId: session._id,
        subject: session.subject,
        department: session.department,
        courseId: session.courseId,
        year: session.year,
        yearId: session.yearId,
        section: session.section,
        sectionId: session.sectionId,
        classLabel: getClassLabel({
          courseName: session.department,
          yearNumber: session.year,
          sectionName: session.section,
        }),
        isActive: session.isActive,
        startTime: session.startTime,
        totalStudents,
        totalPresent,
        totalAbsent,
        attendancePercentage,
        hasMarkedAttendance: Boolean(attendanceRecord),
        presentStudents: [],
        absentStudents: [],
      });
    }

    // Keep list scoped to the session class when class metadata is present.
    const allStudents = await User.find(buildSessionStudentQuery(session)).select("name email").lean();

    const attendanceRecords = await Attendance.find({ sessionId })
      .populate("studentId", "name email")
      .lean();

    const presentStudentsRaw = attendanceRecords
      .map((record) => record.studentId)
      .filter(Boolean)
      .map((student) => ({
        id: student._id,
        name: student.name,
        email: student.email,
      }));

    const presentStudentMap = new Map();
    presentStudentsRaw.forEach((student) => {
      presentStudentMap.set(student.email, student);
    });
    const presentStudents = Array.from(presentStudentMap.values());

    const presentEmailSet = new Set(presentStudents.map((student) => student.email));
    const absentStudents = allStudents
      .filter((student) => !presentEmailSet.has(student.email))
      .map((student) => ({
        id: student._id,
        name: student.name,
        email: student.email,
      }));

    const totalStudents = allStudents.length;
    const totalPresent = presentStudents.length;
    const totalAbsent = absentStudents.length;
    const attendancePercentage = calculatePercentage(totalPresent, totalStudents);

    return sendSuccess(res, 200, "Session attendance summary fetched.", {
      sessionId: session._id,
      subject: session.subject,
      department: session.department,
      courseId: session.courseId,
      year: session.year,
      yearId: session.yearId,
      section: session.section,
      sectionId: session.sectionId,
      classLabel: getClassLabel({
        courseName: session.department,
        yearNumber: session.year,
        sectionName: session.section,
      }),
      isActive: session.isActive,
      startTime: session.startTime,
      totalStudents,
      totalPresent,
      totalAbsent,
      attendancePercentage,
      presentStudents,
      absentStudents,
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch session attendance summary.", error);
  }
};

// Subject-wise summary for a student: total vs attended per subject.
const getStudentSubjectSummary = async (req, res) => {
  try {
    const { studentId } = req.params;
    const authStudentId = req.user?.id;

    if (!authStudentId || !isValidObjectId(authStudentId)) {
      return sendError(res, 401, "Authentication required.");
    }

    if (studentId && String(authStudentId) !== String(studentId)) {
      return sendError(res, 403, "You can only view your own subject summary.");
    }

    const student = await User.findById(authStudentId).select(
      "role department year section courseId yearId sectionId"
    );
    if (!student || student.role !== "student") {
      return sendError(res, 404, "Student not found.");
    }

    const hierarchy = await ensureStudentAcademicMapping(student);
    const normalizedDepartment = String(hierarchy?.courseName || student.department || "").trim();
    const normalizedYear = Number(hierarchy?.yearNumber || student.year);
    const normalizedSection = normalizeSection(hierarchy?.sectionName || student.section);
    const normalizedSectionId = hierarchy?.sectionId || student.sectionId;
    const normalizedYearId = hierarchy?.yearId || student.yearId;

    // Strict subject scope:
    // 1) Prefer Subject.yearId === student.yearId
    // 2) Fallback for legacy data to department + year
    const subjectQuery = normalizedYearId
      ? { yearId: normalizedYearId }
      : {
          department: normalizedDepartment,
          year: normalizedYear,
        };

    const subjects = await Subject.find(subjectQuery).select("_id name").sort({ name: 1 }).lean();
    if (subjects.length === 0) {
      return sendSuccess(res, 200, "Student subject summary fetched.", { summary: [] });
    }

    const subjectIds = new Set(subjects.map((item) => String(item._id)));
    const canonicalNameById = new Map();
    const canonicalNameByLower = new Map();
    subjects.forEach((item) => {
      const canonical = String(item.name || "").trim();
      if (!canonical) return;
      canonicalNameById.set(String(item._id), canonical);
      canonicalNameByLower.set(canonical.toLowerCase(), canonical);
    });

    // Scope sessions to the authenticated student's class only.
    const sessionQuery = normalizedSectionId
      ? { sectionId: normalizedSectionId }
      : {
          department: normalizedDepartment,
          year: normalizedYear,
          section: normalizedSection,
        };
    const classSessions = await Session.find(sessionQuery).select("_id subjectId subject").lean();

    const summaryMap = new Map();
    subjects.forEach((item) => {
      summaryMap.set(item.name, {
        subject: item.name,
        totalSessions: 0,
        attendedSessions: 0,
      });
    });

    // Only keep class sessions that belong to student's subject list.
    const matchedSessionIds = [];
    const subjectBySessionId = new Map();
    classSessions.forEach((session) => {
      const subjectId = session.subjectId ? String(session.subjectId) : "";
      const fallbackName = String(session.subject || "").trim();
      const fallbackKey = fallbackName.toLowerCase();

      let subjectName = null;
      if (subjectId && subjectIds.has(subjectId)) {
        subjectName = canonicalNameById.get(subjectId) || null;
      } else if (fallbackName && canonicalNameByLower.has(fallbackKey)) {
        subjectName = canonicalNameByLower.get(fallbackKey);
      }

      if (!subjectName) return;
      matchedSessionIds.push(session._id);
      subjectBySessionId.set(String(session._id), subjectName);
      const bucket = summaryMap.get(subjectName);
      if (bucket) {
        bucket.totalSessions += 1;
      }
    });

    // Student attendance only from req.user.id, then joined to class-scoped sessions.
    if (matchedSessionIds.length > 0) {
      const attendanceDocs = await Attendance.find({
        studentId: authStudentId,
        sessionId: { $in: matchedSessionIds },
      })
        .select("sessionId")
        .lean();

      attendanceDocs.forEach((attendance) => {
        const subjectName = subjectBySessionId.get(String(attendance.sessionId));
        if (!subjectName) return;
        const bucket = summaryMap.get(subjectName);
        if (bucket) {
          bucket.attendedSessions += 1;
        }
      });
    }

    const summary = subjects.map((item) => {
      const bucket = summaryMap.get(item.name) || {
        subject: item.name,
        totalSessions: 0,
        attendedSessions: 0,
      };
      const percentage =
        bucket.totalSessions === 0
          ? 0
          : Number(((bucket.attendedSessions / bucket.totalSessions) * 100).toFixed(2));

      return {
        subject: bucket.subject,
        totalSessions: bucket.totalSessions,
        attendedSessions: bucket.attendedSessions,
        percentage,
      };
    });

    return sendSuccess(res, 200, "Student subject summary fetched.", {
      classLabel: getClassLabel({
        courseName: hierarchy?.courseName || student.department,
        yearNumber: hierarchy?.yearNumber || student.year,
        sectionName: hierarchy?.sectionName || student.section,
      }),
      summary,
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch student subject summary.", error);
  }
};

const getStudentProfile = async (req, res) => {
  try {
    const studentId = req.user?.id;
    if (!studentId || !isValidObjectId(studentId)) {
      return sendError(res, 401, "Authentication required.");
    }

    const student = await User.findById(studentId).select(
      "name email role department year section courseId yearId sectionId"
    );
    if (!student || student.role !== "student") {
      return sendError(res, 404, "Student not found.");
    }

    const hierarchy = await ensureStudentAcademicMapping(student);
    const profile = {
      id: student._id,
      name: student.name,
      email: student.email,
      role: student.role,
      department: hierarchy?.courseName || student.department,
      year: hierarchy?.yearNumber || student.year,
      section: hierarchy?.sectionName || student.section,
      courseId: hierarchy?.courseId || student.courseId,
      yearId: hierarchy?.yearId || student.yearId,
      sectionId: hierarchy?.sectionId || student.sectionId,
      courseName: hierarchy?.courseName || student.department,
      yearNumber: hierarchy?.yearNumber || student.year,
      sectionName: hierarchy?.sectionName || student.section,
      classLabel: getClassLabel({
        courseName: hierarchy?.courseName || student.department,
        yearNumber: hierarchy?.yearNumber || student.year,
        sectionName: hierarchy?.sectionName || student.section,
      }),
    };

    return sendSuccess(res, 200, "Student profile fetched.", { student: profile });
  } catch (error) {
    return sendServerError(res, "Could not fetch student profile.", error);
  }
};

// Manual override: teacher marks an absent student present in their session.
const manualAttendance = async (req, res) => {
  try {
    const authTeacherId = req.user?.id;
    const { teacherId: bodyTeacherId, studentId, sessionId } = req.body;

    const missing = getMissingFields(req.body, ["studentId", "sessionId"]).filter(
      (f) => f !== "teacherId"
    );
    if (!authTeacherId && !bodyTeacherId) {
      missing.push("teacherId");
    }
    if (missing.length > 0) {
      return sendError(res, 400, "teacherId, studentId, and sessionId are required.");
    }

    const teacherId = authTeacherId || bodyTeacherId;

    if (![teacherId, studentId, sessionId].every(isValidObjectId)) {
      return sendError(res, 400, "Invalid ids supplied.");
    }

    if (authTeacherId && bodyTeacherId && String(bodyTeacherId) !== String(authTeacherId)) {
      return sendError(res, 403, "You can only mark attendance for your own sessions.");
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      return sendError(res, 403, "Only teachers can mark manual attendance.");
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== "student") {
      return sendError(res, 404, "Student not found.");
    }

    if (student.isActive === false) {
      return sendError(res, 403, "Student account is deactivated. Cannot mark attendance.");
    }

    const studentHierarchy = await ensureStudentAcademicMapping(student);
    if (!studentHierarchy) {
      return sendError(res, 400, "Student profile is missing academic hierarchy mapping.");
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      return sendError(res, 404, "Session not found.");
    }

    if (String(session.teacherId) !== String(teacherId)) {
      return sendError(res, 403, "This session does not belong to you.");
    }

    if (!session.isActive) {
      return sendError(res, 400, "Session is not active.");
    }

    if (isSessionExpired(session)) {
      await deactivateSessionIfExpired(session);
      return sendError(res, 400, "Session has expired. Manual attendance is no longer allowed.");
    }

    // CRITICAL VALIDATION: Verify student belongs to session's section
    const sessionSectionId = session.sectionId ? String(session.sectionId) : "";
    const studentSectionId = student.sectionId ? String(student.sectionId) : "";

    if (sessionSectionId && studentSectionId !== sessionSectionId) {
      return sendError(res, 403, "Student does not belong to this session's section.");
    }

    const classMismatchMessage = validateStudentClassForSession(student, session);
    if (classMismatchMessage) {
      return sendError(res, 403, classMismatchMessage);
    }

    // Avoid duplicate insert due to unique index.
    const existing = await Attendance.findOne({ studentId, sessionId });

    if (existing) {
      return sendSuccess(res, 200, "Attendance already marked.", { alreadyPresent: true });
    }

    const attendance = await Attendance.create({
      studentId,
      sessionId,
    });

    return sendSuccess(res, 201, "Student marked present.", {
      studentName: student.name,
      subject: session.subject,
      timestamp: attendance.timestamp,
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 200, "Attendance already marked.");
    }
    return sendServerError(res, "Could not mark attendance manually.", error);
  }
};

// Unmark attendance (remove record) by teacher for their session.
const unmarkAttendance = async (req, res) => {
  try {
    const authTeacherId = req.user?.id;
    const { teacherId: bodyTeacherId, studentId, sessionId } = req.body;

    const missing = getMissingFields(req.body, ["studentId", "sessionId"]).filter(
      (f) => f !== "teacherId"
    );
    if (!authTeacherId && !bodyTeacherId) {
      missing.push("teacherId");
    }
    if (missing.length > 0) {
      return sendError(res, 400, "teacherId, studentId, and sessionId are required.");
    }

    const teacherId = authTeacherId || bodyTeacherId;

    if (![teacherId, studentId, sessionId].every(isValidObjectId)) {
      return sendError(res, 400, "Invalid ids supplied.");
    }

    if (authTeacherId && bodyTeacherId && String(bodyTeacherId) !== String(authTeacherId)) {
      return sendError(res, 403, "You can only unmark attendance for your own sessions.");
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.role !== "teacher") {
      return sendError(res, 403, "Only teachers can unmark attendance.");
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      return sendError(res, 404, "Session not found.");
    }
    if (String(session.teacherId) !== String(teacherId)) {
      return sendError(res, 403, "This session does not belong to you.");
    }

    // Allow unmarking during session (while isActive) or within 1 hour after session expires
    const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
    const hasValidExpiry = Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()));
    const correctionWindowEnd = hasValidExpiry
      ? new Date(expiresAt.getTime() + 60 * 60 * 1000)
      : null; // 1 hour after expiry
    const now = new Date();
    
    if (!session.isActive && correctionWindowEnd && now > correctionWindowEnd) {
      return sendError(
        res,
        400,
        "Correction window has closed. You can only unmark attendance during the session or within 1 hour after it ends."
      );
    }

    const deleted = await Attendance.findOneAndDelete({ studentId, sessionId });
    if (!deleted) {
      return sendError(res, 404, "Attendance record not found.");
    }

    return sendSuccess(res, 200, "Attendance unmarked.", {
      studentId,
      sessionId,
    });
  } catch (error) {
    return sendServerError(res, "Could not unmark attendance.", error);
  }
};

module.exports = {
  markAttendance,
  getSessionAttendanceSummary,
  getStudentSubjectSummary,
  getStudentProfile,
  manualAttendance,
  unmarkAttendance,
};
