const { Session, User } = require("../models");
const {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  isValidObjectId,
  generateSessionToken,
  buildSessionQrPayload,
} = require("../utils");

const startSession = async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body, ["teacherId", "subject"]);
    if (missingFields.length > 0) {
      return sendError(res, 400, "teacherId and subject are required.");
    }

    const { teacherId, startTime } = req.body;
    const subject = String(req.body.subject).trim();

    if (!isValidObjectId(teacherId)) {
      return sendError(res, 400, "Invalid teacherId.");
    }

    const teacher = await User.findById(teacherId);
    if (!teacher) {
      return sendError(res, 404, "Teacher not found.");
    }

    if (teacher.role !== "teacher") {
      return sendError(res, 403, "Only teachers can start sessions.");
    }

    // Generate token that student scanner uses for attendance marking.
    const sessionToken = generateSessionToken();

    const session = await Session.create({
      teacherId,
      subject,
      startTime: startTime || new Date(),
      sessionToken,
    });

    return sendSuccess(res, 201, "Session started successfully.", {
      sessionId: session._id,
      sessionToken: session.sessionToken,
      qrData: buildSessionQrPayload(session.sessionToken),
      subject: session.subject,
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

    if (!isValidObjectId(sessionId)) {
      return sendError(res, 400, "Invalid sessionId.");
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      return sendError(res, 404, "Session not found.");
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

module.exports = {
  startSession,
  endSession,
};
