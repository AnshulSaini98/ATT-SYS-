/**
 * FIX: Add missing BSc CS subjects
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { Subject, Year } = require("../models");

async function fixBScCSSubjects() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/attendance_system"
    );

    const bscCsSubjects = {
      1: ["Discrete Mathematics", "Computer Fundamentals"],
      2: ["Operating Systems", "OOP with Java"],
      3: ["Computer Networks", "Python Programming"],
    };

    // Get the Year records for BSc CS
    const years = await Year.find()
      .populate("courseId")
      .then((results) =>
        results.filter((y) => y.courseId && y.courseId.name === "BSc CS")
      );

    console.log(`Found ${years.length} years for BSc CS`);

    if (years.length === 0) {
      console.error("No BSc CS years found!");
      process.exit(1);
    }

    // Create subjects for each year
    const subjectDocs = [];
    for (const year of years) {
      const subjects = bscCsSubjects[year.yearNumber] || [];
      for (const subjectName of subjects) {
        subjectDocs.push({
          name: subjectName,
          department: "BSc CS",
          year: year.yearNumber,
          yearId: year._id,
        });
      }
    }

    const created = await Subject.insertMany(subjectDocs);
    console.log(`✅ Created ${created.length} subjects for BSc CS`);

    // Verify
    const bscSubjectsCount = await Subject.countDocuments({
      department: "BSc CS",
    });
    console.log(`✅ Total BSc CS subjects: ${bscSubjectsCount}`);

    const totalSubjects = await Subject.countDocuments();
    console.log(`✅ Total subjects in database: ${totalSubjects}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

fixBScCSSubjects();
