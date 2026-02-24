const express = require("express");
const { attendanceController } = require("../controllers");

const router = express.Router();

router.post("/mark-attendance", attendanceController.markAttendance);
router.get("/session-attendance/:sessionId", attendanceController.getSessionAttendanceSummary);

module.exports = router;
