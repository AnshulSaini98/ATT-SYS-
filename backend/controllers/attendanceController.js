const { Attendance, Session, User } = require("../models");
const {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  isValidObjectId,
} = require("../utils");

const markAttendance = async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body, ["studentId", "sessionToken"]);
    if (missingFields.length > 0) {
      return sendError(res, 400, "studentId and sessionToken are required.");
    }

    const { studentId } = req.body;
    const sessionToken = String(req.body.sessionToken).trim();

    if (!isValidObjectId(studentId)) {
      return sendError(res, 400, "Invalid studentId.");
    }

    const student = await User.findById(studentId);
    if (!student) {
      return sendError(res, 404, "Student not found.");
    }

    if (student.role !== "student") {
      return sendError(res, 403, "Only students can mark attendance.");
    }

    const session = await Session.findOne({ sessionToken });
    if (!session) {
      return sendError(res, 404, "Invalid session token.");
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

    return res.status(201).json({
      message: "Attendance Marked Successfully",
      studentName: student.name,
      subject: session.subject,
      timestamp: attendance.timestamp,
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

    const session = await Session.findById(sessionId).select("subject isActive startTime");
    if (!session) {
      return sendError(res, 404, "Session not found.");
    }

    // Get all students once so we can split into present and absent lists.
    const allStudents = await User.find({ role: "student" }).select("name email").lean();

    const attendanceRecords = await Attendance.find({ sessionId })
      .populate("studentId", "name email")
      .lean();

    const presentStudentsRaw = attendanceRecords
      .map((record) => record.studentId)
      .filter(Boolean)
      .map((student) => ({
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
        name: student.name,
        email: student.email,
      }));

    const totalStudents = allStudents.length;
    const totalPresent = presentStudents.length;
    const totalAbsent = absentStudents.length;
    const attendancePercentage =
      totalStudents === 0 ? 0 : Number(((totalPresent / totalStudents) * 100).toFixed(2));

    return res.status(200).json({
      sessionId: session._id,
      subject: session.subject,
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

module.exports = {
  markAttendance,
  getSessionAttendanceSummary,
};
