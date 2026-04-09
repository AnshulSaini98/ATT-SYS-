const express = require("express");
const { attendanceController } = require("../controllers");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Student endpoint: mark attendance (authenticated student + session token)
router.post("/mark-attendance", authenticate, authorize("student"), attendanceController.markAttendance);

// Query endpoints: requires authentication
router.get("/session-attendance/:sessionId", authenticate, attendanceController.getSessionAttendanceSummary);
router.get("/student/me", authenticate, authorize("student"), attendanceController.getStudentProfile);
router.get("/student/subject-summary", authenticate, authorize("student"), attendanceController.getStudentSubjectSummary);
router.get(
  "/student/subject-summary/:studentId",
  authenticate,
  authorize("student"),
  attendanceController.getStudentSubjectSummary
);

// Teacher endpoints: require teacher role
router.post("/teacher/manual-attendance", authenticate, authorize("teacher"), attendanceController.manualAttendance);
router.post("/teacher/unmark-attendance", authenticate, authorize("teacher"), attendanceController.unmarkAttendance);

module.exports = router;
