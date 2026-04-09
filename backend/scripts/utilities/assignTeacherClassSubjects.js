require("dotenv").config();
const mongoose = require("mongoose");
const { User, Subject, Section, TeacherAssignment } = require("../models");

const normalizeSection = (value) => String(value || "").trim().toUpperCase();

const run = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not configured in backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const teachers = await User.find({ role: "teacher" }).select("_id name email subjects").lean();
    let processedTeachers = 0;
    let activeAssignmentRows = 0;
    let skippedSubjects = 0;

    for (const teacher of teachers) {
      const subjectIds = Array.isArray(teacher.subjects)
        ? teacher.subjects.map((id) => String(id)).filter(Boolean)
        : [];

      if (subjectIds.length === 0) {
        await TeacherAssignment.updateMany({ teacherId: teacher._id }, { $set: { isActive: false } });
        processedTeachers += 1;
        continue;
      }

      const subjects = await Subject.find({ _id: { $in: subjectIds } })
        .populate({
          path: "yearId",
          select: "yearNumber courseId",
          populate: {
            path: "courseId",
            select: "name",
          },
        })
        .lean();

      const validSubjectIdSet = new Set();

      for (const subject of subjects) {
        const yearId = subject?.yearId?._id || subject?.yearId;
        const yearNumber = Number(subject?.yearId?.yearNumber || subject?.year);
        const courseId = subject?.yearId?.courseId?._id;
        const courseName = subject?.yearId?.courseId?.name || subject?.department || "BCA";

        if (!yearId || !Number.isInteger(yearNumber)) {
          skippedSubjects += 1;
          continue;
        }

        const sections = await Section.find({ yearId }).select("_id name").lean();
        if (sections.length === 0) {
          skippedSubjects += 1;
          continue;
        }

        validSubjectIdSet.add(String(subject._id));

        for (const section of sections) {
          const sectionName = normalizeSection(section.name);
          if (!sectionName) continue;

          await TeacherAssignment.findOneAndUpdate(
            {
              teacherId: teacher._id,
              subjectId: subject._id,
              year: yearNumber,
              section: sectionName,
            },
            {
              $set: {
                teacherId: teacher._id,
                subjectId: subject._id,
                department: courseName,
                courseId,
                year: yearNumber,
                yearId,
                section: sectionName,
                sectionId: section._id,
                isActive: true,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          activeAssignmentRows += 1;
        }
      }

      await TeacherAssignment.updateMany(
        {
          teacherId: teacher._id,
          subjectId: { $nin: Array.from(validSubjectIdSet) },
        },
        { $set: { isActive: false } }
      );

      processedTeachers += 1;
    }

    console.log(
      `Assignment sync complete. Teachers processed: ${processedTeachers}, Active class rows upserted: ${activeAssignmentRows}, Skipped subjects: ${skippedSubjects}`
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Assignment sync failed:", error.message);
    try {
      await mongoose.connection.close();
    } catch (_ignore) {
      // no-op
    }
    process.exit(1);
  }
};

run();
