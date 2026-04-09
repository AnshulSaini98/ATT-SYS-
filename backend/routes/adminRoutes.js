const express = require("express");
const { adminController } = require("../controllers");
const { authenticate, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize("admin"));

// Admin user management routes.
router.get("/admin/users", adminController.listUsers);
router.get("/admin/classes", adminController.listClasses);
router.post("/admin/users", adminController.createUser);
router.put("/admin/users/:userId", adminController.updateUser);
router.delete("/admin/users/:userId", adminController.deleteUser);
router.patch("/admin/toggle-user/:userId", adminController.toggleUser);
router.get("/admin/system-summary", adminController.systemSummary);
router.get("/admin/session-log", adminController.sessionLog);
router.post("/admin/subjects", adminController.createSubject);
router.get("/admin/subjects", adminController.listSubjects);
router.delete("/admin/subjects/:subjectId", adminController.deleteSubject);
router.put("/admin/assign-subjects/:teacherId", adminController.assignSubjects);

// Class subject and teacher management
router.get("/admin/classes/:sectionId/subjects", adminController.getClassSubjects);
router.get("/admin/classes/:sectionId/teachers", adminController.getClassTeachers);
router.post("/admin/classes/:sectionId/assign-subjects", adminController.assignSubjectsToClass);

// Year subject management
router.get("/admin/years/:yearId/subjects", adminController.getYearSubjects);

// Student attendance history
router.get("/admin/students/:studentId/attendance", adminController.getStudentAttendanceHistory);

// Attendance report export
router.get("/admin/export/attendance", adminController.exportAttendanceReport);

module.exports = router;
