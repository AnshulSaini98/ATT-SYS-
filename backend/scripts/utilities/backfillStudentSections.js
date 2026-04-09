require("dotenv").config();
const mongoose = require("mongoose");
const { User, Attendance } = require("../models");
const { resolveStudentHierarchy, applyHierarchyToStudent } = require("../utils");

const MAX_STUDENTS_PER_SECTION = 7;

const run = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not configured in backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const students = await User.find({ role: "student" }).sort({ createdAt: 1 });

    let updated = 0;
    const invalidStudentIds = [];
    const bySection = new Map();

    for (const student of students) {
      const hierarchy = await resolveStudentHierarchy(student, { autoCreate: true });

      if (!hierarchy) {
        invalidStudentIds.push(student._id);
        continue;
      }

      const needsUpdate =
        String(student.sectionId || "") !== String(hierarchy.sectionId) ||
        String(student.yearId || "") !== String(hierarchy.yearId) ||
        String(student.courseId || "") !== String(hierarchy.courseId) ||
        String(student.department || "").trim() !== String(hierarchy.courseName || "").trim() ||
        Number(student.year) !== Number(hierarchy.yearNumber) ||
        String(student.section || "").trim().toUpperCase() !==
          String(hierarchy.sectionName || "").trim().toUpperCase();

      if (needsUpdate) {
        applyHierarchyToStudent(student, hierarchy);
        await student.save();
        updated += 1;
      }

      const sectionKey = String(hierarchy.sectionId);
      if (!bySection.has(sectionKey)) {
        bySection.set(sectionKey, []);
      }
      bySection.get(sectionKey).push(student._id);
    }

    let removedInvalid = 0;
    if (invalidStudentIds.length > 0) {
      await Attendance.deleteMany({ studentId: { $in: invalidStudentIds } });
      const deleteResult = await User.deleteMany({ _id: { $in: invalidStudentIds } });
      removedInvalid = deleteResult.deletedCount || 0;
    }

    let trimmedStudents = 0;
    const trimIds = [];
    bySection.forEach((studentIds) => {
      if (studentIds.length > MAX_STUDENTS_PER_SECTION) {
        const extras = studentIds.slice(MAX_STUDENTS_PER_SECTION);
        trimIds.push(...extras);
      }
    });

    if (trimIds.length > 0) {
      await Attendance.deleteMany({ studentId: { $in: trimIds } });
      const trimResult = await User.deleteMany({ _id: { $in: trimIds } });
      trimmedStudents = trimResult.deletedCount || 0;
    }

    console.log(
      `Student cleanup complete. Updated mappings: ${updated}, Removed invalid: ${removedInvalid}, Trimmed for section cap (${MAX_STUDENTS_PER_SECTION}): ${trimmedStudents}`
    );
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Backfill failed:", error.message);
    try {
      await mongoose.connection.close();
    } catch (_ignore) {
      // no-op
    }
    process.exit(1);
  }
};

run();
