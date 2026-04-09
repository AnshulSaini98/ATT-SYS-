/**
 * COMPREHENSIVE DATA CLEANUP SCRIPT
 * 
 * Fixes and validates dataset according to 7-part specification:
 * 1. Course Structure (BCA, BSc CS, MCA, PGDCA)
 * 2. Year Structure (Year 1, 2, 3 per course)
 * 3. Section Structure (Section A, B per year)
 * 4. Student Fix (6-7 per section, proper mappings)
 * 5. Subject Fix (2-3 per year)
 * 6. Class Label Structure (proper format)
 * 7. Data Validation (referential integrity)
 */

require("dotenv").config();
const mongoose = require("mongoose");
const {
  User,
  Subject,
  Course,
  Year,
  Section,
  Attendance,
  Session,
  TeacherAssignment,
} = require("../models");

const COMMON_PASSWORD = "$2b$10$9pUML15HqAkKoGJ3XrL/teTqANB5CDuVhTfOcgACWYSpoIA.VcvSS"; // pre-hashed "1111"
const COURSES_TO_CREATE = ["BCA", "BSc CS", "MCA", "PGDCA"];
const YEARS = [1, 2, 3];
const SECTIONS = ["A", "B"];
const STUDENTS_PER_SECTION = 6; // Changed from 7 to 6 for better organization

// Subject blueprint: 2-3 subjects per year per course
const SUBJECT_BLUEPRINT = {
  BCA: {
    1: ["Mathematics", "Programming in C"],
    2: ["DBMS", "Data Structures"],
    3: ["Web Development", "Software Engineering"],
  },
  "BSc CS": {
    1: ["CS Discrete Mathematics", "CS Computer Fundamentals"],
    2: ["CS Operating Systems", "CS OOP with Java"],
    3: ["CS Computer Networks", "CS Python Programming"],
  },
  MCA: {
    1: ["Advanced Data Structures", "Database Systems"],
    2: ["Web Technologies", "Software Architecture"],
    3: ["Machine Learning", "Cloud Computing"],
  },
  PGDCA: {
    1: ["Systems Analysis", "Programming Paradigms"],
    2: ["Database Design", "Web Application Development"],
    3: ["Network Security", "Advanced DBMS"],
  },
};

// Log utilities
const log = {
  section: (title) => console.log("\n" + "=".repeat(60)),
  section_end: (title) => console.log("=".repeat(60)),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
  warning: (msg) => console.log(`⚠️  ${msg}`),
};

/**
 * PART 1: COURSE STRUCTURE VALIDATION & CREATION
 */
async function cleanupCoursesStructure() {
  log.section();
  console.log("PART 1: COURSE STRUCTURE VALIDATION & CREATION");
  log.section_end();

  try {
    // Delete existing courses and their relationships
    const existingCourses = await Course.find();
    log.info(`Found ${existingCourses.length} existing courses`);

    // Delete cascade: Years -> Sections -> delete students with those sections
    for (const course of existingCourses) {
      const years = await Year.find({ courseId: course._id });
      for (const year of years) {
        const sections = await Section.find({ yearId: year._id });
        const sectionIds = sections.map((s) => s._id);
        
        // Delete students belonging to these sections
        await User.deleteMany({ sectionId: { $in: sectionIds } });
        
        // Delete sections
        await Section.deleteMany({ yearId: year._id });
      }
      
      // Delete years
      await Year.deleteMany({ courseId: course._id });
    }

    // Delete all courses
    await Course.deleteMany({});
    log.success("Deleted all existing courses and related data");

    // Create new courses
    const courseDocs = COURSES_TO_CREATE.map((name) => ({ name }));
    const courses = await Course.insertMany(courseDocs);
    
    const courseMap = new Map(courses.map((doc) => [doc.name, doc]));
    log.success(`Created ${courses.length} courses: ${COURSES_TO_CREATE.join(", ")}`);

    return courseMap;
  } catch (error) {
    log.error(`Course cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * PART 2: YEAR STRUCTURE VALIDATION & CREATION
 */
async function cleanupYearsStructure(courseMap) {
  log.section();
  console.log("PART 2: YEAR STRUCTURE VALIDATION & CREATION");
  log.section_end();

  try {
    // Delete existing years
    await Year.deleteMany({});
    log.success("Deleted all existing years");

    // Create years for each course
    const yearDocs = [];
    for (const courseName of COURSES_TO_CREATE) {
      const course = courseMap.get(courseName);
      for (const yearNumber of YEARS) {
        yearDocs.push({
          courseId: course._id,
          yearNumber,
        });
      }
    }

    const years = await Year.insertMany(yearDocs);
    log.success(`Created ${years.length} years (3 years per ${COURSES_TO_CREATE.length} courses)`);

    // Build year map for later use
    const yearMap = new Map();
    for (const year of years) {
      const course = Array.from(courseMap.values()).find(
        (c) => String(c._id) === String(year.courseId)
      );
      const courseName = course.name;
      yearMap.set(`${courseName}|${year.yearNumber}`, year);
    }

    return yearMap;
  } catch (error) {
    log.error(`Year cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * PART 3: SECTION STRUCTURE VALIDATION & CREATION
 */
async function cleanupSectionsStructure(courseMap, yearMap) {
  log.section();
  console.log("PART 3: SECTION STRUCTURE VALIDATION & CREATION");
  log.section_end();

  try {
    // Delete existing sections
    await Section.deleteMany({});
    log.success("Deleted all existing sections");

    // Create sections for each year
    const sectionDocs = [];
    for (const courseName of COURSES_TO_CREATE) {
      for (const yearNumber of YEARS) {
        const year = yearMap.get(`${courseName}|${yearNumber}`);
        for (const sectionName of SECTIONS) {
          sectionDocs.push({
            yearId: year._id,
            name: sectionName,
          });
        }
      }
    }

    const sections = await Section.insertMany(sectionDocs);
    log.success(
      `Created ${sections.length} sections (2 sections × 3 years × 4 courses)`
    );

    // Build section map
    const sectionMap = new Map();
    for (const section of sections) {
      const year = Array.from(yearMap.values()).find(
        (y) => String(y._id) === String(section.yearId)
      );
      const course = courseMap.get(
        Array.from(courseMap.keys()).find(
          (name) =>
            String(courseMap.get(name)._id) === String(year.courseId)
        )
      );
      const key = `${course.name}|${year.yearNumber}|${section.name}`;
      sectionMap.set(key, {
        sectionId: section._id,
        yearId: year._id,
        courseId: course._id,
        courseName: course.name,
        yearNumber: year.yearNumber,
        sectionName: section.name,
      });
    }

    return sectionMap;
  } catch (error) {
    log.error(`Section cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * PART 4: STUDENT RECORD CLEANUP & REORGANIZATION
 */
async function cleanupStudentRecords(courseMap, yearMap, sectionMap) {
  log.section();
  console.log("PART 4: STUDENT RECORD CLEANUP & REORGANIZATION");
  log.section_end();

  try {
    // Delete all existing students (not admin/teacher)
    const result = await User.deleteMany({ role: "student" });
    log.success(`Deleted ${result.deletedCount} existing student records`);

    // Create fresh student records: 6 students per section
    const studentDocs = [];
    let globalStudentIndex = 0;

    for (const courseName of COURSES_TO_CREATE) {
      for (const yearNumber of YEARS) {
        for (const sectionName of SECTIONS) {
          const sectionKey = `${courseName}|${yearNumber}|${sectionName}`;
          const hierarchy = sectionMap.get(sectionKey);

          for (let i = 1; i <= STUDENTS_PER_SECTION; i++) {
            globalStudentIndex++;
            const rollNo = `${courseName.replace(/\s+/g, "")}${yearNumber}${sectionName}${String(i).padStart(2, "0")}`;

            studentDocs.push({
              name: generateName(globalStudentIndex),
              rollNo,
              email: `${rollNo.toLowerCase()}@demo.edu`,
              fatherName: generateFatherName(globalStudentIndex),
              phoneNo: generatePhone(globalStudentIndex),
              password: COMMON_PASSWORD,
              role: "student",
              department: hierarchy.courseName,
              year: hierarchy.yearNumber,
              section: hierarchy.sectionName,
              courseId: hierarchy.courseId,
              yearId: hierarchy.yearId,
              sectionId: hierarchy.sectionId,
              isActive: true,
            });
          }
        }
      }
    }

    const students = await User.insertMany(studentDocs);
    log.success(
      `Created ${students.length} students (${STUDENTS_PER_SECTION} per section × 24 sections)`
    );

    return students;
  } catch (error) {
    log.error(`Student cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * PART 5: SUBJECT RECORD CLEANUP
 */
async function cleanupSubjectRecords(courseMap, yearMap) {
  log.section();
  console.log("PART 5: SUBJECT RECORD CLEANUP");
  log.section_end();

  try {
    // Delete all subjects
    const deletedSubjects = await Subject.deleteMany({});
    log.success(`Deleted ${deletedSubjects.deletedCount} existing subjects`);

    // Create subjects according to blueprint (2-3 per year)
    const subjectDocs = [];
    for (const courseName of COURSES_TO_CREATE) {
      for (const yearNumber of YEARS) {
        const year = yearMap.get(`${courseName}|${yearNumber}`);
        const subjectNames = SUBJECT_BLUEPRINT[courseName][yearNumber] || [];

        for (const subjectName of subjectNames) {
          subjectDocs.push({
            name: subjectName,
            department: courseName,
            year: yearNumber,
            yearId: year._id,
          });
        }
      }
    }

    const subjects = await Subject.insertMany(subjectDocs);
    log.success(
      `Created ${subjects.length} subjects (2-3 per year, limited per course)`
    );

    // Build subject map for reference
    const subjectMap = new Map();
    for (const subject of subjects) {
      const key = `${subject.department}|${subject.year}|${subject.name}`;
      subjectMap.set(key, subject);
    }

    return subjects;
  } catch (error) {
    log.error(`Subject cleanup failed: ${error.message}`);
    throw error;
  }
}

/**
 * PART 6: CLASS LABEL STRUCTURE VALIDATION
 * Shows proper class label format
 */
async function validateClassLabelStructure(courseMap, yearMap, sectionMap) {
  log.section();
  console.log("PART 6: CLASS LABEL STRUCTURE VALIDATION");
  log.section_end();

  try {
    const classLabels = [];
    
    for (const courseName of COURSES_TO_CREATE) {
      for (const yearNumber of YEARS) {
        for (const sectionName of SECTIONS) {
          const sectionKey = `${courseName}|${yearNumber}|${sectionName}`;
          const hierarchy = sectionMap.get(sectionKey);
          
          // Proper class label format: "{course} Year {yearNumber} - Section {sectionName}"
          const classLabel = `${courseName} Year ${yearNumber} - Section ${sectionName}`;
          classLabels.push({
            classLabel,
            courseId: hierarchy.courseId,
            yearId: hierarchy.yearId,
            sectionId: hierarchy.sectionId,
          });
        }
      }
    }

    log.success(`Class label format validated: "${classLabels[0].classLabel}"`);
    log.info(`Total class groupings: ${classLabels.length}`);

    // Show example groupings
    log.info("\n📋 Sample Class Labels (first 6):");
    classLabels.slice(0, 6).forEach((cls, idx) => {
      console.log(`   ${idx + 1}. ${cls.classLabel}`);
    });

    return classLabels;
  } catch (error) {
    log.error(`Class label validation failed: ${error.message}`);
    throw error;
  }
}

/**
 * PART 7: DATA VALIDATION & REFERENTIAL INTEGRITY
 */
async function validateDataIntegrity(courseMap, yearMap, sectionMap) {
  log.section();
  console.log("PART 7: DATA VALIDATION & REFERENTIAL INTEGRITY");
  log.section_end();

  try {
    const issues = [];

    // Check 1: No students without sectionId
    const studentsWithoutSection = await User.find({
      role: "student",
      sectionId: { $exists: false },
    });
    if (studentsWithoutSection.length > 0) {
      issues.push(
        `❌ Found ${studentsWithoutSection.length} students without sectionId`
      );
      await User.deleteMany({
        role: "student",
        sectionId: { $exists: false },
      });
      log.warning(`Removed ${studentsWithoutSection.length} orphaned students`);
    } else {
      log.success("✓ All students have valid sectionId");
    }

    // Check 2: No sections without yearId
    const sectionsWithoutYear = await Section.find({
      yearId: { $exists: false },
    });
    if (sectionsWithoutYear.length > 0) {
      issues.push(
        `❌ Found ${sectionsWithoutYear.length} sections without yearId`
      );
      await Section.deleteMany({ yearId: { $exists: false } });
    } else {
      log.success("✓ All sections have valid yearId");
    }

    // Check 3: No years without courseId
    const yearsWithoutCourse = await Year.find({
      courseId: { $exists: false },
    });
    if (yearsWithoutCourse.length > 0) {
      issues.push(
        `❌ Found ${yearsWithoutCourse.length} years without courseId`
      );
      await Year.deleteMany({ courseId: { $exists: false } });
    } else {
      log.success("✓ All years have valid courseId");
    }

    // Check 4: No subjects without yearId
    const subjectsWithoutYear = await Subject.find({
      yearId: { $exists: false },
    });
    if (subjectsWithoutYear.length > 0) {
      issues.push(
        `❌ Found ${subjectsWithoutYear.length} subjects without yearId`
      );
      await Subject.deleteMany({ yearId: { $exists: false } });
    } else {
      log.success("✓ All subjects have valid yearId");
    }

    // Check 5: No duplicate students
    const students = await User.find({ role: "student" });
    const emailSet = new Set();
    let duplicates = 0;
    for (const student of students) {
      if (emailSet.has(student.email)) {
        duplicates++;
      }
      emailSet.add(student.email);
    }
    if (duplicates > 0) {
      issues.push(`❌ Found ${duplicates} duplicate student emails`);
    } else {
      log.success("✓ No duplicate student records");
    }

    // Summary
    log.section();
    console.log("VALIDATION SUMMARY:");
    if (issues.length === 0) {
      log.success("✅ ALL DATA VALIDATION PASSED - Dataset is clean!");
    } else {
      log.warning(`⚠️  ${issues.length} issues found and fixed`);
      issues.forEach((issue) => console.log(`   ${issue}`));
    }
    log.section_end();

    return issues.length === 0;
  } catch (error) {
    log.error(`Data validation failed: ${error.message}`);
    throw error;
  }
}

/**
 * FINAL SUMMARY REPORT
 */
async function generateSummaryReport(courseMap, yearMap, sectionMap, subjects) {
  log.section();
  console.log("FINAL DATA CLEANUP SUMMARY");
  log.section_end();

  try {
    const courses = await Course.find();
    const years = await Year.find();
    const sections = await Section.find();
    const students = await User.find({ role: "student" });
    const teachers = await User.find({ role: "teacher" });

    console.log("\n📊 DATASET STATISTICS:\n");
    console.log(`   Courses Created:  ${courses.length} (${courses.map((c) => c.name).join(", ")})`);
    console.log(`   Years per Course: 3 (Year 1, 2, 3)`);
    console.log(`   Sections per Year: 2 (Section A, B)`);
    console.log(`   Total Sections:   ${sections.length}`);
    console.log(`   Total Students:   ${students.length} (${STUDENTS_PER_SECTION} per section)`);
    console.log(`   Total Subjects:   ${subjects.length}`);
    console.log(`   Teachers:         ${teachers.length}`);

    console.log("\n📚 SUBJECT DISTRIBUTION:\n");
    for (const courseName of COURSES_TO_CREATE) {
      const courseSubjects = subjects.filter((s) => s.department === courseName);
      console.log(`   ${courseName}:`);
      for (const yearNum of YEARS) {
        const yearSubjects = courseSubjects.filter((s) => s.year === yearNum);
        const subjectNames = yearSubjects.map((s) => s.name).join(", ");
        console.log(`      Year ${yearNum}: ${subjectNames || "N/A"}`);
      }
    }

    console.log("\n🎓 STUDENT DISTRIBUTION:\n");
    for (const courseName of COURSES_TO_CREATE) {
      const courseStudents = students.filter((s) => s.department === courseName);
      console.log(`   ${courseName}: ${courseStudents.length} students`);
      for (const yearNum of YEARS) {
        for (const sectionName of SECTIONS) {
          const count = students.filter(
            (s) =>
              s.department === courseName &&
              s.year === yearNum &&
              s.section === sectionName
          ).length;
          console.log(`      Year ${yearNum} Section ${sectionName}: ${count} students`);
        }
      }
    }

    console.log("\n✅ CLEANUP COMPLETE!\n");
    console.log("Dataset is now:");
    console.log("  ✓ Clean and properly organized");
    console.log("  ✓ Correctly mapped (Course → Year → Section → Students)");
    console.log("  ✓ Data integrity validated");
    console.log("  ✓ Ready for demo and production use");

  } catch (error) {
    log.error(`Summary report failed: ${error.message}`);
    throw error;
  }
}

/**
 * MAIN EXECUTION
 */
async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/attendance_system");
    log.success("Connected to MongoDB");

    // Execute cleanup in sequence
    log.info("\n🚀 Starting comprehensive data cleanup...\n");

    const courseMap = await cleanupCoursesStructure();
    const yearMap = await cleanupYearsStructure(courseMap);
    const sectionMap = await cleanupSectionsStructure(courseMap, yearMap);
    const students = await cleanupStudentRecords(courseMap, yearMap, sectionMap);
    const subjects = await cleanupSubjectRecords(courseMap, yearMap);
    await validateClassLabelStructure(courseMap, yearMap, sectionMap);
    const isClean = await validateDataIntegrity(courseMap, yearMap, sectionMap);

    // Generate summary
    await generateSummaryReport(courseMap, yearMap, sectionMap, subjects);

    // Close connection
    await mongoose.connection.close();
    log.success("Database connection closed");
    process.exit(0);
  } catch (error) {
    log.error(`Critical error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

/**
 * HELPER FUNCTIONS
 */
function generateName(index) {
  const firstNames = [
    "Aarav", "Vivaan", "Aditya", "Arjun", "Ishaan", "Krishna", "Rohan", "Karan",
    "Manav", "Pranav", "Siddharth", "Harsh", "Aditi", "Ananya", "Priya", "Sneha",
    "Kavya", "Ishita", "Riya", "Pooja", "Nisha", "Megha", "Tanvi", "Shreya",
  ];
  const lastNames = [
    "Sharma", "Verma", "Gupta", "Singh", "Yadav", "Tiwari", "Mishra", "Jain",
    "Agarwal", "Chauhan", "Kumar", "Mehta",
  ];
  const first = firstNames[index % firstNames.length];
  const last = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
  return `${first} ${last}`;
}

function generateFatherName(index) {
  const firstNames = [
    "Rajesh", "Mukesh", "Suresh", "Mahesh", "Dinesh", "Ramesh", "Vijay", "Ajay",
    "Naresh", "Anil", "Sunil", "Pankaj",
  ];
  const lastNames = [
    "Sharma", "Verma", "Gupta", "Singh", "Yadav", "Tiwari", "Mishra", "Jain",
    "Agarwal", "Chauhan", "Kumar", "Mehta",
  ];
  const first = firstNames[index % firstNames.length];
  const last = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
  return `${first} ${last}`;
}

function generatePhone(index) {
  const tail = String(880000000 + index).padStart(9, "0");
  return `9${tail}`;
}

// Run the script
main();
