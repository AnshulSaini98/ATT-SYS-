const express = require("express");
const { sessionController } = require("../controllers");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// Teacher routes require authentication and teacher role
router.post("/start-session", authenticate, authorize("teacher"), sessionController.startSession);
router.post("/end-session", authenticate, authorize("teacher"), sessionController.endSession);
router.get("/teacher-sessions/:teacherId", authenticate, authorize("teacher"), sessionController.getTeacherSessions);
router.get("/teacher/subject-summary/:teacherId", authenticate, authorize("teacher"), sessionController.getTeacherSubjectSummary);
router.get("/teacher/defaulters/:teacherId", authenticate, authorize("teacher"), sessionController.getTeacherDefaulters);
router.get("/teacher/subjects", authenticate, authorize("teacher"), sessionController.getTeacherSubjects);
router.get("/teacher/subjects/:teacherId", authenticate, authorize("teacher"), sessionController.getTeacherSubjects);

module.exports = router;
