const { Session, User, Attendance, Subject, TeacherAssignment } = require("../models");
const mongoose = require("mongoose");
const {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  isValidObjectId,
  generateSessionToken,
  buildSessionQrPayload,
  calculatePercentage,
  hasRole,
  teacherOwnsSubject,
  ensureAcademicHierarchy,
  getClassLabel,
} = require("../utils");

const ALLOWED_YEARS = new Set([1, 2, 3]);

const normalizeDepartment = (value) => String(value || "BCA").trim() || "BCA";
const normalizeSection = (value) => String(value || "").trim().toUpperCase();

const buildClassStudentQuery = (session) => {
  const query = { role: "student" };
  if (session?.sectionId) {
    query.sectionId = session.sectionId;
    return query;
  }
  if (session?.department) query.department = session.department;
  if (Number.isInteger(session?.year)) query.year = session.year;
  if (session?.section) query.section = session.section;
  return query;
};

const buildAssignmentPayload = (assignmentDoc) => {
  const subject = assignmentDoc.subjectId;
  return {
    assignmentId: assignmentDoc._id,
    subjectId: subject?._id || assignmentDoc.subjectId,
    subject: subject?.name || undefined,
    department: assignmentDoc.department,
    courseId: assignmentDoc.courseId,
    year: assignmentDoc.year,
    yearId: assignmentDoc.yearId,
    section: normalizeSection(assignmentDoc.section),
    sectionId: assignmentDoc.sectionId,
    classLabel: getClassLabel({
      courseName: assignmentDoc.department,
      yearNumber: assignmentDoc.year,
      sectionName: assignmentDoc.section,
    }),
  };
};

const getTeacherAssignments = async (teacherDoc) => {
  const teacherId = teacherDoc?._id;
  if (!teacherId) return [];

  let assignments = await TeacherAssignment.find({ teacherId, isActive: true })
    .populate("subjectId", "name department year")
    .lean();

  if (assignments.length > 0) {
    return assignments;
  }

  // Backward-compatible bootstrap:
  // if assignment records do not exist yet, derive defaults from teacher.subjects.
  const defaultSections = teacherDoc.section
    ? [normalizeSection(teacherDoc.section)]
    : ["A", "B"];
  const subjectList = Array.isArray(teacherDoc.subjects) ? teacherDoc.subjects : [];
  const bootstrapRows = [];

  for (const subjectItem of subjectList) {
    const subjectId = subjectItem?._id || subjectItem;
    const subjectDepartment = normalizeDepartment(
      subjectItem?.department || teacherDoc.department || "BCA"
    );
    const subjectYear = Number(subjectItem?.year);
    if (!subjectId || !Number.isInteger(subjectYear)) continue;

    for (const section of defaultSections) {
      const hierarchy = await ensureAcademicHierarchy({
        courseName: subjectDepartment,
        yearNumber: subjectYear,
        sectionName: section,
      });
      bootstrapRows.push({
        teacherId,
        subjectId,
        department: subjectDepartment,
        year: subjectYear,
        section: normalizeSection(section),
        courseId: hierarchy?.courseId,
        yearId: hierarchy?.yearId,
        sectionId: hierarchy?.sectionId,
      });
    }
  }

  if (bootstrapRows.length > 0) {
    try {
      await TeacherAssignment.insertMany(bootstrapRows, { ordered: false });
    } catch (_err) {
      // Ignore duplicate bootstrap collisions.
    }
  }

  assignments = await TeacherAssignment.find({ teacherId, isActive: true })
    .populate("subjectId", "name department year")
    .lean();
  return assignments;
};

const startSession = async (req, res) => {
  try {
    // Enforce identity: authenticated teacher can only start their own session.
    const authTeacherId = req.user?.id;
    const requestedTeacherId = req.body.teacherId;

    if (authTeacherId && requestedTeacherId && String(requestedTeacherId) !== String(authTeacherId)) {
      return sendError(res, 403, "You can only start sessions for yourself.");
    }

    const teacherId = authTeacherId || requestedTeacherId;
    const missingFields = getMissingFields(req.body, ["subjectId", "year"]).filter(
      (f) => f !== "teacherId"
    );
    if (!teacherId) {
      missingFields.push("teacherId");
    }
    if (missingFields.length > 0) {
      return sendError(res, 400, "teacherId, subjectId, and year are required.");
    }

    const { startTime, subjectId } = req.body;

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, "Invalid teacherId.");
    }

    let teacher = null;
    try {
      teacher = await User.findById(teacherId).populate("subjects", "name department year");
    } catch (_err) {
      teacher = await User.findById(teacherId);
    }
    if (!teacher) {
      return sendError(res, 404, "Teacher not found.");
    }

    if (!hasRole(teacher, "teacher")) {
      return sendError(res, 403, "Only teachers can start sessions.");
    }

    if (!Array.isArray(teacher.subjects) || teacher.subjects.length === 0) {
      return sendError(res, 400, "No subjects assigned. Ask admin to assign subjects first.");
    }

    const teacherAssignments = await getTeacherAssignments(teacher);
    if (teacherAssignments.length === 0) {
      return sendError(
        res,
        400,
        "No class assignments found. Ask admin to assign subject/year/section."
      );
    }

    if (!subjectId || !isValidObjectId(subjectId)) {
      return sendError(res, 400, "subjectId is required and must be valid for assigned subjects.");
    }

    const subjectDoc = await Subject.findById(subjectId);
    if (!subjectDoc) {
      return sendError(res, 404, "Subject not found.");
    }

    if (!teacherOwnsSubject(teacher, subjectId)) {
      return sendError(res, 403, "You are not assigned to this subject.");
    }

    // Year must be explicit from teacher selection for subject-year validation.
    let department = normalizeDepartment(req.body.department || teacher.department);
    const resolvedYearRaw = req.body.year;
    const year = Number(resolvedYearRaw);
    if (!ALLOWED_YEARS.has(year)) {
      return sendError(res, 400, "year must be one of 1, 2, or 3.");
    }

    const section = normalizeSection(req.body.section || teacher.section || "A");
    if (!section) {
      return sendError(res, 400, "section is required.");
    }

    if (typeof subjectDoc.year !== "number") {
      return sendError(
        res,
        400,
        "Selected subject is missing year mapping. Ask admin to update this subject."
      );
    }

    if (subjectDoc.year !== year) {
      return sendError(res, 400, `Selected subject is for year ${subjectDoc.year}, not year ${year}.`);
    }

    if (
      subjectDoc.department &&
      normalizeDepartment(subjectDoc.department).toLowerCase() !== department.toLowerCase()
    ) {
      return sendError(res, 400, "Selected subject does not belong to the requested department.");
    }

    const matchedAssignment = teacherAssignments.find((assignment) => {
      const assignmentSubjectId = assignment.subjectId?._id || assignment.subjectId;
      return (
        String(assignmentSubjectId) === String(subjectId) &&
        Number(assignment.year) === year &&
        normalizeSection(assignment.section) === section
      );
    });

    if (!matchedAssignment) {
      return sendError(
        res,
        403,
        "You are not assigned to this subject/year/section combination."
      );
    }

    const assignmentDepartment = normalizeDepartment(
      matchedAssignment.department || subjectDoc.department || teacher.department
    );
    if (assignmentDepartment.toLowerCase() !== department.toLowerCase()) {
      return sendError(res, 400, "Requested department does not match your assignment.");
    }
    department = assignmentDepartment;

    const classHierarchy = await ensureAcademicHierarchy({
      courseName: department,
      yearNumber: year,
      sectionName: section,
    });
    if (!classHierarchy) {
      return sendError(res, 400, "Could not resolve academic hierarchy for this class.");
    }
    if (
      matchedAssignment.sectionId &&
      String(matchedAssignment.sectionId) !== String(classHierarchy.sectionId)
    ) {
      return sendError(res, 403, "You are not assigned to this class.");
    }

    const subjectNameResolved = subjectDoc.name;

    // Generate token that student scanner uses for attendance marking.
    const sessionToken = generateSessionToken();
    
    // Session expires 5 minutes after start time
    const startTimeDate = startTime ? new Date(startTime) : new Date();
    const expiresAt = new Date(startTimeDate.getTime() + 5 * 60 * 1000);

    const session = await Session.create({
      teacherId,
      subjectId: subjectDoc._id,
      subject: subjectNameResolved,
      department,
      courseId: classHierarchy.courseId,
      year,
      yearId: classHierarchy.yearId,
      section,
      sectionId: classHierarchy.sectionId,
      startTime: startTimeDate,
      expiresAt,
      sessionToken,
    });

    return sendSuccess(res, 201, "Session started successfully.", {
      sessionId: session._id,
      sessionToken: session.sessionToken,
      qrData: buildSessionQrPayload(session.sessionToken),
      subjectId: subjectDoc._id,
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
      startTime: session.startTime,
      isActive: session.isActive,
    });
  } catch (error) {
    return sendServerError(res, "Could not start session.", error);
  }
};

const endSession = async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body, ["sessionId"]);
    if (missingFields.length > 0) {
      return sendError(res, 400, "sessionId is required.");
    }

    const { sessionId } = req.body;
    const authTeacherId = req.user?.id;

    if (!isValidObjectId(sessionId)) {
      return sendError(res, 400, "Invalid sessionId.");
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      return sendError(res, 404, "Session not found.");
    }

    // Teacher can end only their own session
    if (authTeacherId && String(session.teacherId) !== String(authTeacherId)) {
      return sendError(res, 403, "You can only end your own sessions.");
    }

    session.isActive = false;
    await session.save();

    return sendSuccess(res, 200, "Session ended successfully.", {
      sessionId: session._id,
      isActive: session.isActive,
    });
  } catch (error) {
    return sendServerError(res, "Could not end session.", error);
  }
};

// Returns a lightweight list of recent sessions for a teacher with present/absent counts.
const getTeacherSessions = async (req, res) => {
  try {
    const { teacherId: teacherIdParam } = req.params;
    const authTeacherId = req.user?.id;
    const teacherId = authTeacherId || teacherIdParam;

    if (authTeacherId && teacherIdParam && String(teacherIdParam) !== String(authTeacherId)) {
      return sendError(res, 403, "You can only view your own sessions.");
    }

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, "Invalid teacherId.");
    }

    const teacher = await User.findById(teacherId);
    if (!teacher) {
      return sendError(res, 404, "Teacher not found.");
    }

    if (!hasRole(teacher, "teacher")) {
      return sendError(res, 403, "Only teachers can view their sessions.");
    }

    const sessions = await Session.find({ teacherId })
      .sort({ startTime: -1 })
      .limit(5)
      .lean();

    const sessionsWithCounts = await Promise.all(
      sessions.map(async (session) => {
        const totalStudents = await User.countDocuments(buildClassStudentQuery(session));
        const presentCount = await Attendance.countDocuments({ sessionId: session._id });
        const absentCount = Math.max(totalStudents - presentCount, 0);
        return {
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
          startTime: session.startTime,
          isActive: session.isActive,
          presentCount,
          absentCount,
        };
      })
    );

    return sendSuccess(res, 200, "Recent sessions fetched.", {
      sessions: sessionsWithCounts,
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch recent sessions.", error);
  }
};

// Subject-wise summary for a teacher: total sessions and average attendance percentage.
const getTeacherSubjectSummary = async (req, res) => {
  try {
    const { teacherId: teacherIdParam } = req.params;
    const authTeacherId = req.user?.id;
    const teacherId = authTeacherId || teacherIdParam;

    if (authTeacherId && teacherIdParam && String(teacherIdParam) !== String(authTeacherId)) {
      return sendError(res, 403, "You can only view your own subject summary.");
    }

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, "Invalid teacherId.");
    }

    const teacher = await User.findById(teacherId).lean();
    if (!teacher || !hasRole(teacher, "teacher")) {
      return sendError(res, 404, "Teacher not found.");
    }

    // Group teacher sessions by subject to avoid N+1.
    const groupedSessions = await Session.aggregate([
      { $match: { teacherId: new mongoose.Types.ObjectId(teacherId) } },
      {
        $group: {
          _id: "$subject",
          sessionIds: { $push: "$_id" },
          totalSessions: { $sum: 1 },
        },
      },
    ]);

    if (groupedSessions.length === 0) {
      return sendSuccess(res, 200, "Teacher subject summary fetched.", { summary: [] });
    }

    // Flatten all session ids for attendance aggregation.
    const allSessionIds = groupedSessions.flatMap((item) => item.sessionIds);

    const attendanceCounts = await Attendance.aggregate([
      { $match: { sessionId: { $in: allSessionIds } } },
      { $group: { _id: "$sessionId", presentCount: { $sum: 1 } } },
    ]);
    const attendanceMap = new Map(attendanceCounts.map((row) => [String(row._id), row.presentCount]));

    const totalStudents = await User.countDocuments({ role: "student" });

    const summary = groupedSessions.map((group) => {
      const presentCounts = group.sessionIds.map((id) => attendanceMap.get(String(id)) || 0);
      const sessionsCount = group.totalSessions || 0;
      const averagePercentage =
        sessionsCount === 0 || totalStudents === 0
          ? 0
          : Number(
              (
                presentCounts.reduce(
                  (acc, val) => acc + calculatePercentage(val, totalStudents),
                  0
                ) / sessionsCount
              ).toFixed(2)
            );

      return {
        subject: group._id || "Unknown",
        totalSessions: group.totalSessions || 0,
        averageAttendancePercentage: averagePercentage,
      };
    });

    return sendSuccess(res, 200, "Teacher subject summary fetched.", { summary });
  } catch (error) {
    return sendServerError(res, "Could not fetch teacher subject summary.", error);
  }
};

// Defaulter list: students under this teacher with attendance < 75% per subject.
const getTeacherDefaulters = async (req, res) => {
  try {
    const { teacherId: teacherIdParam } = req.params;
    const authTeacherId = req.user?.id;
    const teacherId = authTeacherId || teacherIdParam;

    if (authTeacherId && teacherIdParam && String(teacherIdParam) !== String(authTeacherId)) {
      return sendError(res, 403, "You can only view your own defaulters.");
    }

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, "Invalid teacherId.");
    }

    const teacher = await User.findById(teacherId).lean();
    if (!teacher || teacher.role !== "teacher") {
      return sendError(res, 404, "Teacher not found.");
    }

    const sessions = await Session.find({ teacherId })
      .select("_id subject department year section sectionId")
      .lean();
    if (sessions.length === 0) {
      return sendSuccess(res, 200, "No sessions for defaulter list.", { defaulters: [] });
    }

    // Group by subject + class scope so percentages stay class-accurate.
    const groups = new Map();
    sessions.forEach((session) => {
      const subject = session.subject || "Unknown";
      const department = session.department || "";
      const year = Number.isInteger(session.year) ? session.year : Number(session.year);
      const section = normalizeSection(session.section || "");
      const sectionId = session.sectionId ? String(session.sectionId) : "";
      const key = `${subject}||${department}||${Number.isInteger(year) ? year : ""}||${sectionId || section}`;
      if (!groups.has(key)) {
        groups.set(key, {
          subject,
          department,
          year: Number.isInteger(year) ? year : undefined,
          section: section || undefined,
          sectionId: session.sectionId || undefined,
          sessionIds: [],
        });
      }
      groups.get(key).sessionIds.push(session._id);
    });

    const defaulters = [];

    for (const group of groups.values()) {
      const studentQuery = { role: "student" };
      if (group.department) {
        studentQuery.department = group.department;
      }
      if (Number.isInteger(group.year)) {
        studentQuery.year = group.year;
      }
      if (group.sectionId) {
        studentQuery.sectionId = group.sectionId;
      } else if (group.section) {
        studentQuery.section = group.section;
      }

      const [students, attendanceAgg] = await Promise.all([
        User.find(studentQuery).select("_id name").lean(),
        Attendance.aggregate([
          { $match: { sessionId: { $in: group.sessionIds } } },
          { $group: { _id: "$studentId", attended: { $sum: 1 } } },
        ]),
      ]);

      if (students.length === 0) {
        continue;
      }

      const attendedMap = new Map(attendanceAgg.map((row) => [String(row._id), row.attended || 0]));
      const totalSessions = group.sessionIds.length;

      students.forEach((student) => {
        const attended = attendedMap.get(String(student._id)) || 0;
        const pct =
          totalSessions === 0 ? 0 : Number(((attended / totalSessions) * 100).toFixed(2));
        if (pct < 75) {
          defaulters.push({
            studentName: student.name,
            subject: group.subject,
            department: group.department || undefined,
            year: group.year,
            section: group.section,
            classLabel: getClassLabel({
              courseName: group.department,
              yearNumber: group.year,
              sectionName: group.section,
            }),
            attendedSessions: attended,
            totalSessions,
            percentage: pct,
          });
        }
      });
    }

    return sendSuccess(res, 200, "Defaulter list fetched.", { defaulters });
  } catch (error) {
    return sendServerError(res, "Could not fetch defaulter list.", error);
  }
};

// Fetch assigned subjects for a teacher.
const getTeacherSubjects = async (req, res) => {
  try {
    const { teacherId: teacherIdParam } = req.params;
    const teacherId = req.user?.id;

    if (!teacherId) {
      return sendError(res, 401, "Authentication required.");
    }

    if (teacherIdParam && String(teacherIdParam) !== String(teacherId)) {
      return sendError(res, 403, "You can only view your assigned subjects.");
    }

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, "Invalid teacherId.");
    }

    const teacher = await User.findById(teacherId)
      .populate("subjects", "name department year")
      .lean();
    if (!teacher || !hasRole(teacher, "teacher")) {
      return sendError(res, 404, "Teacher not found.");
    }

    const assignmentDocs = await getTeacherAssignments(teacher);
    const assignments = assignmentDocs.map(buildAssignmentPayload);

    const subjectMap = new Map();
    assignments.forEach((assignment) => {
      if (!assignment.subjectId) return;
      subjectMap.set(String(assignment.subjectId), {
        _id: assignment.subjectId,
        name: assignment.subject,
        department: assignment.department,
        year: assignment.year,
      });
    });

    const subjects = Array.from(subjectMap.values());
    const years = [...new Set(assignments.map((item) => Number(item.year)).filter(Number.isInteger))].sort(
      (a, b) => a - b
    );
    const sections = [...new Set(assignments.map((item) => normalizeSection(item.section)).filter(Boolean))].sort();
    const classMap = new Map();
    assignments.forEach((assignment) => {
      const key =
        String(assignment.sectionId || "") ||
        `${assignment.department}|${assignment.year}|${assignment.section}`;
      if (classMap.has(key)) return;
      classMap.set(key, {
        sectionId: assignment.sectionId,
        yearId: assignment.yearId,
        courseId: assignment.courseId,
        courseName: assignment.department,
        yearNumber: assignment.year,
        sectionName: assignment.section,
        classLabel: assignment.classLabel,
      });
    });
    const classes = Array.from(classMap.values()).sort((a, b) =>
      String(a.classLabel || "").localeCompare(String(b.classLabel || ""))
    );

    return sendSuccess(res, 200, "Teacher subjects fetched.", {
      subjects,
      assignments,
      classes,
      years,
      sections,
    });
  } catch (error) {
    return sendServerError(res, "Could not fetch teacher subjects.", error);
  }
};

module.exports = {
  startSession,
  endSession,
  getTeacherSessions,
  getTeacherSubjectSummary,
  getTeacherDefaulters,
  getTeacherSubjects,
};
