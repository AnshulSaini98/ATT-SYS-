require("dotenv").config();
const mongoose = require("mongoose");
const { Subject, Course, Year, User, TeacherAssignment, Session } = require("../models");

const ALLOWED_YEARS = new Set([1, 2, 3]);

const normalizeDepartment = (value) => String(value || "BCA").trim() || "BCA";

const run = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not configured in backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const subjects = await Subject.find({})
      .select("_id name department year yearId")
      .lean();

    let updated = 0;
    const invalidSubjectIds = [];

    for (const subject of subjects) {
      const normalizedDepartment = normalizeDepartment(subject.department);
      const parsedYear = Number(subject.year);

      if (!subject.name || !ALLOWED_YEARS.has(parsedYear)) {
        invalidSubjectIds.push(subject._id);
        continue;
      }

      const course = await Course.findOneAndUpdate(
        { name: normalizedDepartment },
        { $setOnInsert: { name: normalizedDepartment } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const yearDoc = await Year.findOneAndUpdate(
        { courseId: course._id, yearNumber: parsedYear },
        { $setOnInsert: { courseId: course._id, yearNumber: parsedYear } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const expectedYearId = String(yearDoc._id);
      const currentYearId = subject.yearId ? String(subject.yearId) : "";

      if (
        currentYearId !== expectedYearId ||
        String(subject.department || "") !== String(course.name) ||
        Number(subject.year) !== yearDoc.yearNumber
      ) {
        await Subject.updateOne(
          { _id: subject._id },
          {
            $set: {
              department: course.name,
              year: yearDoc.yearNumber,
              yearId: yearDoc._id,
            },
          }
        );
        updated += 1;
      }
    }

    let removed = 0;
    if (invalidSubjectIds.length > 0) {
      await User.updateMany(
        { subjects: { $in: invalidSubjectIds } },
        { $pull: { subjects: { $in: invalidSubjectIds } } }
      );
      await TeacherAssignment.deleteMany({ subjectId: { $in: invalidSubjectIds } });
      await Session.updateMany(
        { subjectId: { $in: invalidSubjectIds } },
        { $unset: { subjectId: "" } }
      );

      const result = await Subject.deleteMany({ _id: { $in: invalidSubjectIds } });
      removed = result.deletedCount || 0;
    }

    console.log(
      `Subject backfill complete. Updated: ${updated}, Removed invalid subjects: ${removed}`
    );
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Subject backfill failed:", error.message);
    try {
      await mongoose.connection.close();
    } catch (_ignore) {
      // no-op
    }
    process.exit(1);
  }
};

run();
