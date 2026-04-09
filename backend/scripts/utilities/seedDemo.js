/**
 * Demo seed script for Smart Attendance System.
 * Clean academic hierarchy: Course -> Year -> Section -> Students.
 *
 * Run:
 *   npm run seed:demo
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const {
  User,
  Subject,
  Session,
  Attendance,
  TeacherAssignment,
  Course,
  Year,
  Section,
} = require("../models");
const { generateSessionToken } = require("../utils");

const COMMON_PASSWORD = "1111";
const STUDENTS_PER_SECTION = 7;

const COURSES = ["BCA", "BSc CS"];
const YEARS = [1, 2, 3];
const SECTIONS = ["A", "B"];

const SUBJECT_BLUEPRINT = {
  BCA: {
    1: ["Mathematics", "Programming in C"],
    2: ["DBMS", "Data Structures"],
    3: ["Web Development", "Software Engineering"],
  },
  "BSc CS": {
    1: ["Discrete Mathematics", "Computer Fundamentals"],
    2: ["Operating Systems", "OOP with Java"],
    3: ["Computer Networks", "Python Programming"],
  },
};

const TEACHER_BLUEPRINT = [
  {
    name: "Rahul Sharma",
    email: "rahul.sharma@demo.edu",
    subjectKeys: ["BCA|2|DBMS", "BSc CS|2|Operating Systems"],
  },
  {
    name: "Priya Verma",
    email: "priya.verma@demo.edu",
    subjectKeys: ["BCA|3|Web Development", "BSc CS|1|Computer Fundamentals"],
  },
  {
    name: "Ankit Srivastava",
    email: "ankit.srivastava@demo.edu",
    subjectKeys: ["BCA|1|Programming in C", "BSc CS|3|Python Programming"],
  },
  {
    name: "Neha Kapoor",
    email: "neha.kapoor@demo.edu",
    subjectKeys: ["BCA|2|Data Structures", "BSc CS|3|Computer Networks"],
  },
  {
    name: "Sandeep Mishra",
    email: "sandeep.mishra@demo.edu",
    subjectKeys: ["BCA|1|Mathematics", "BSc CS|1|Discrete Mathematics"],
  },
];

const SESSION_BLUEPRINT = [
  {
    teacherEmail: "rahul.sharma@demo.edu",
    course: "BCA",
    year: 2,
    section: "A",
    subject: "DBMS",
    startOffsetMinutes: -1,
    isActive: true,
    presentCount: 5,
  },
  {
    teacherEmail: "priya.verma@demo.edu",
    course: "BCA",
    year: 3,
    section: "B",
    startOffsetMinutes: -180,
    subject: "Web Development",
    isActive: false,
    presentCount: 4,
  },
  {
    teacherEmail: "ankit.srivastava@demo.edu",
    course: "BCA",
    year: 1,
    section: "A",
    startOffsetMinutes: -320,
    subject: "Programming in C",
    isActive: false,
    presentCount: 6,
  },
];

const STUDENT_FIRST_NAMES = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Arjun",
  "Ishaan",
  "Krishna",
  "Rohan",
  "Karan",
  "Manav",
  "Pranav",
  "Siddharth",
  "Harsh",
  "Aditi",
  "Ananya",
  "Priya",
  "Sneha",
  "Kavya",
  "Ishita",
  "Riya",
  "Pooja",
  "Nisha",
  "Megha",
  "Tanvi",
  "Shreya",
];

const STUDENT_LAST_NAMES = [
  "Sharma",
  "Verma",
  "Gupta",
  "Singh",
  "Yadav",
  "Tiwari",
  "Mishra",
  "Jain",
  "Agarwal",
  "Chauhan",
  "Kumar",
  "Mehta",
];

const FATHER_FIRST_NAMES = [
  "Rajesh",
  "Mukesh",
  "Suresh",
  "Mahesh",
  "Dinesh",
  "Ramesh",
  "Vijay",
  "Ajay",
  "Naresh",
  "Anil",
  "Sunil",
  "Pankaj",
];

const FATHER_LAST_NAMES = [
  "Sharma",
  "Verma",
  "Gupta",
  "Singh",
  "Yadav",
  "Tiwari",
  "Mishra",
  "Jain",
  "Agarwal",
  "Chauhan",
  "Kumar",
  "Mehta",
];

const makeSubjectKey = (course, year, subjectName) => `${course}|${year}|${subjectName}`;
const makeHierarchyKey = (course, year, section) => `${course}|${year}|${section}`;

const makeStudentName = (index) => {
  const first = STUDENT_FIRST_NAMES[index % STUDENT_FIRST_NAMES.length];
  const last = STUDENT_LAST_NAMES[Math.floor(index / STUDENT_FIRST_NAMES.length) % STUDENT_LAST_NAMES.length];
  return `${first} ${last}`;
};

const makeFatherName = (index) => {
  const first = FATHER_FIRST_NAMES[index % FATHER_FIRST_NAMES.length];
  const last = FATHER_LAST_NAMES[Math.floor(index / FATHER_FIRST_NAMES.length) % FATHER_LAST_NAMES.length];
  return `${first} ${last}`;
};

const makePhoneNo = (index) => {
  const tail = String(880000000 + index).padStart(9, "0");
  return `9${tail}`;
};

const createAcademicHierarchy = async () => {
  const courses = await Course.insertMany(COURSES.map((name) => ({ name })), { ordered: true });
  const courseByName = new Map(courses.map((doc) => [doc.name, doc]));

  const yearDocs = [];
  COURSES.forEach((courseName) => {
    const course = courseByName.get(courseName);
    YEARS.forEach((yearNumber) => {
      yearDocs.push({ courseId: course._id, yearNumber });
    });
  });
  const years = await Year.insertMany(yearDocs, { ordered: true });
  const yearByKey = new Map();
  years.forEach((doc) => {
    const courseName = COURSES.find((name) => String(courseByName.get(name)._id) === String(doc.courseId));
    yearByKey.set(`${courseName}|${doc.yearNumber}`, doc);
  });

  const sectionDocs = [];
  COURSES.forEach((courseName) => {
    YEARS.forEach((yearNumber) => {
      const yearDoc = yearByKey.get(`${courseName}|${yearNumber}`);
      SECTIONS.forEach((sectionName) => {
        sectionDocs.push({
          yearId: yearDoc._id,
          name: sectionName,
        });
      });
    });
  });
  const sections = await Section.insertMany(sectionDocs, { ordered: true });
  const sectionByKey = new Map();
  sections.forEach((sectionDoc) => {
    const yearDoc = years.find((item) => String(item._id) === String(sectionDoc.yearId));
    const courseName = COURSES.find(
      (name) => String(courseByName.get(name)._id) === String(yearDoc.courseId)
    );
    sectionByKey.set(makeHierarchyKey(courseName, yearDoc.yearNumber, sectionDoc.name), {
      courseId: yearDoc.courseId,
      yearId: yearDoc._id,
      sectionId: sectionDoc._id,
      courseName,
      yearNumber: yearDoc.yearNumber,
      sectionName: sectionDoc.name,
    });
  });

  return { courseByName, yearByKey, sectionByKey };
};

const createSubjects = async ({ yearByKey }) => {
  const subjectDocs = [];

  COURSES.forEach((course) => {
    YEARS.forEach((year) => {
      const yearDoc = yearByKey.get(`${course}|${year}`);
      if (!yearDoc) {
        throw new Error(`Missing year mapping for ${course} Year ${year}`);
      }
      SUBJECT_BLUEPRINT[course][year].forEach((subjectName) => {
        subjectDocs.push({
          name: subjectName,
          department: course,
          year,
          yearId: yearDoc._id,
        });
      });
    });
  });

  return Subject.insertMany(subjectDocs, { ordered: true });
};

const createUsers = async ({ hashedPassword, subjectIdByKey, sectionByKey }) => {
  const adminDoc = {
    name: "Conference Admin",
    email: "admin@example.com",
    password: hashedPassword,
    role: "admin",
    department: "BCA",
    isActive: true,
  };

  const teacherDocs = TEACHER_BLUEPRINT.map((teacher) => {
    const firstSubjectKey = teacher.subjectKeys[0] || "BCA|1|Mathematics";
    const teacherCourse = firstSubjectKey.split("|")[0] || "BCA";
    return {
      name: teacher.name,
      email: teacher.email,
      password: hashedPassword,
      role: "teacher",
      department: teacherCourse,
      subjects: teacher.subjectKeys.map((key) => subjectIdByKey.get(key)).filter(Boolean),
      isActive: true,
    };
  });

  // Demo student dataset:
  // BCA only, Year 1/2/3, Section A/B, 7 students per section => 42 students total.
  const studentDocs = [];
  let studentIndex = 0;

  YEARS.forEach((year) => {
    SECTIONS.forEach((section) => {
      const hierarchy = sectionByKey.get(makeHierarchyKey("BCA", year, section));
      for (let i = 1; i <= STUDENTS_PER_SECTION; i += 1) {
        studentIndex += 1;
        const rollNo = `BCA${year}${section}${String(i).padStart(2, "0")}`;
        studentDocs.push({
          name: makeStudentName(studentIndex),
          rollNo,
          email: `${rollNo.toLowerCase()}@demo.edu`,
          fatherName: makeFatherName(studentIndex),
          phoneNo: makePhoneNo(studentIndex),
          password: hashedPassword,
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
    });
  });

  const createdUsers = await User.insertMany([adminDoc, ...teacherDocs, ...studentDocs], {
    ordered: true,
  });

  const admin = createdUsers.find((u) => u.role === "admin");
  const teachers = createdUsers.filter((u) => u.role === "teacher");
  const students = createdUsers.filter((u) => u.role === "student");

  return { admin, teachers, students };
};

const createTeacherAssignments = async ({ teachers, subjects, sectionByKey }) => {
  const rows = [];
  const teacherByEmail = new Map(teachers.map((doc) => [doc.email, doc]));
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));

  TEACHER_BLUEPRINT.forEach((teacherCfg) => {
    const teacher = teacherByEmail.get(teacherCfg.email);
    if (!teacher) return;
    const teacherSubjectIds = Array.isArray(teacher.subjects) ? teacher.subjects : [];

    teacherSubjectIds.forEach((subjectId) => {
      const subject = subjectById.get(String(subjectId));
      if (!subject) return;

      SECTIONS.forEach((sectionName) => {
        const hierarchy = sectionByKey.get(
          makeHierarchyKey(subject.department, subject.year, sectionName)
        );
        if (!hierarchy) return;
        rows.push({
          teacherId: teacher._id,
          subjectId: subject._id,
          department: hierarchy.courseName,
          courseId: hierarchy.courseId,
          year: hierarchy.yearNumber,
          yearId: hierarchy.yearId,
          section: hierarchy.sectionName,
          sectionId: hierarchy.sectionId,
          isActive: true,
        });
      });
    });
  });

  if (rows.length === 0) return [];
  return TeacherAssignment.insertMany(rows, { ordered: false });
};

const createSessionsAndAttendance = async ({ teachers, students, subjectIdByKey, sectionByKey }) => {
  const teacherByEmail = new Map(teachers.map((teacher) => [teacher.email, teacher]));
  const studentsByClass = new Map();

  students.forEach((student) => {
    const key = `${student.department}|${student.year}|${student.section}`;
    if (!studentsByClass.has(key)) {
      studentsByClass.set(key, []);
    }
    studentsByClass.get(key).push(student);
  });

  const now = new Date();
  const sessionDocs = SESSION_BLUEPRINT.map((config) => {
    const teacher = teacherByEmail.get(config.teacherEmail);
    const startTime = new Date(now.getTime() + config.startOffsetMinutes * 60 * 1000);
    const expiresAt = new Date(startTime.getTime() + 5 * 60 * 1000);
    const subjectKey = makeSubjectKey(config.course, config.year, config.subject);
    const subjectId = subjectIdByKey.get(subjectKey);
    const hierarchy = sectionByKey.get(makeHierarchyKey(config.course, config.year, config.section));

    if (!teacher || !subjectId || !hierarchy) {
      throw new Error(`Invalid session blueprint: ${config.teacherEmail} / ${subjectKey}`);
    }

    return {
      teacherId: teacher._id,
      subjectId,
      subject: config.subject,
      department: hierarchy.courseName,
      courseId: hierarchy.courseId,
      year: hierarchy.yearNumber,
      yearId: hierarchy.yearId,
      section: hierarchy.sectionName,
      sectionId: hierarchy.sectionId,
      startTime,
      expiresAt,
      isActive: config.isActive,
      sessionToken: generateSessionToken(),
    };
  });

  const sessions = await Session.insertMany(sessionDocs, { ordered: true });

  const attendanceDocs = [];
  sessions.forEach((session, index) => {
    const cfg = SESSION_BLUEPRINT[index];
    const classKey = `${cfg.course}|${cfg.year}|${cfg.section}`;
    const classStudents = studentsByClass.get(classKey) || [];
    const presentStudents = classStudents.slice(0, Math.min(cfg.presentCount, classStudents.length));

    presentStudents.forEach((student, studentIdx) => {
      attendanceDocs.push({
        studentId: student._id,
        sessionId: session._id,
        timestamp: new Date(session.startTime.getTime() + (studentIdx + 1) * 30 * 1000),
      });
    });
  });

  const attendance = await Attendance.insertMany(attendanceDocs, { ordered: true });
  return { sessions, attendance };
};

const seedDemo = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI is not configured in backend/.env");
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);

    console.log("Clearing old demo data...");
    await Attendance.deleteMany({});
    await Session.deleteMany({});
    await TeacherAssignment.deleteMany({});
    await User.deleteMany({});
    await Subject.deleteMany({});
    await Section.deleteMany({});
    await Year.deleteMany({});
    await Course.deleteMany({});

    const hashedPassword = await bcrypt.hash(COMMON_PASSWORD, 10);

    console.log("Creating academic hierarchy...");
    const { yearByKey, sectionByKey } = await createAcademicHierarchy();

    console.log("Creating subjects (2 per year, per course)...");
    const subjects = await createSubjects({ yearByKey });
    const subjectIdByKey = new Map();
    subjects.forEach((subject) => {
      subjectIdByKey.set(makeSubjectKey(subject.department, subject.year, subject.name), subject._id);
    });

    console.log("Creating admin, teachers, and students...");
    const { admin, teachers, students } = await createUsers({
      hashedPassword,
      subjectIdByKey,
      sectionByKey,
    });

    console.log("Creating teacher assignments...");
    await createTeacherAssignments({ teachers, subjects, sectionByKey });

    console.log("Creating sessions and attendance...");
    const { sessions, attendance } = await createSessionsAndAttendance({
      teachers,
      students,
      subjectIdByKey,
      sectionByKey,
    });

    console.log("\nDemo dataset created successfully.\n");
    console.log("Summary:");
    console.log(`- Courses: ${COURSES.join(", ")}`);
    console.log(`- Subjects: ${subjects.length}`);
    console.log(`- Teachers: ${teachers.length}`);
    console.log(
      `- Students: ${students.length} (${STUDENTS_PER_SECTION} per section for BCA Year 1/2/3, Sections A/B)`
    );
    console.log(`- Sessions: ${sessions.length}`);
    console.log(`- Attendance records: ${attendance.length}`);

    console.log("\nDemo credentials (all users):");
    console.log(`- Password: ${COMMON_PASSWORD}`);
    console.log(`- Admin: ${admin.email}`);
    console.log(`- Teacher sample: ${teachers[0]?.email}`);
    console.log(`- Student sample: ${students[0]?.email}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error.message);
    try {
      await mongoose.connection.close();
    } catch (_ignore) {
      // no-op
    }
    process.exit(1);
  }
};

seedDemo();
