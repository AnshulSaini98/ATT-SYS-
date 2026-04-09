const { Course, Year, Section } = require("../models");
const { isValidObjectId } = require("./validators");

const normalizeCourseName = (value) => String(value || "BCA").trim() || "BCA";
const normalizeSectionName = (value) => String(value || "").trim().toUpperCase();

const normalizeYearNumber = (value) => {
  const yearNumber = Number(value);
  if (!Number.isInteger(yearNumber)) return null;
  return yearNumber;
};

const getClassLabel = (sectionLike) => {
  const courseName =
    sectionLike?.courseName ||
    sectionLike?.department ||
    sectionLike?.courseId?.name ||
    sectionLike?.yearId?.courseId?.name ||
    "";
  const yearNumber =
    sectionLike?.yearNumber ??
    sectionLike?.year ??
    sectionLike?.yearId?.yearNumber;
  const sectionName =
    sectionLike?.sectionName ||
    sectionLike?.section ||
    sectionLike?.name ||
    "";

  const normalizedCourse = String(courseName || "").trim();
  const normalizedYear = Number(yearNumber);
  const normalizedSection = normalizeSectionName(sectionName);
  if (!normalizedCourse || !Number.isInteger(normalizedYear) || !normalizedSection) {
    return "Unknown Class";
  }
  return `${normalizedCourse} Year ${normalizedYear} - Section ${normalizedSection}`;
};

const ensureAcademicHierarchy = async ({ courseName, yearNumber, sectionName }) => {
  const normalizedCourse = normalizeCourseName(courseName);
  const normalizedYear = normalizeYearNumber(yearNumber);
  const normalizedSection = normalizeSectionName(sectionName);

  if (!normalizedCourse || !normalizedYear || !normalizedSection) {
    return null;
  }

  const course = await Course.findOneAndUpdate(
    { name: normalizedCourse },
    { $setOnInsert: { name: normalizedCourse } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const year = await Year.findOneAndUpdate(
    { courseId: course._id, yearNumber: normalizedYear },
    { $setOnInsert: { courseId: course._id, yearNumber: normalizedYear } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const section = await Section.findOneAndUpdate(
    { yearId: year._id, name: normalizedSection },
    { $setOnInsert: { yearId: year._id, name: normalizedSection } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    courseId: course._id,
    yearId: year._id,
    sectionId: section._id,
    courseName: course.name,
    yearNumber: year.yearNumber,
    sectionName: section.name,
    classLabel: getClassLabel({
      courseName: course.name,
      yearNumber: year.yearNumber,
      sectionName: section.name,
    }),
  };
};

const resolveHierarchyFromSectionId = async (sectionId) => {
  if (!sectionId || !isValidObjectId(sectionId)) {
    return null;
  }

  const section = await Section.findById(sectionId).populate({
    path: "yearId",
    populate: {
      path: "courseId",
    },
  });

  if (!section || !section.yearId || !section.yearId.courseId) {
    return null;
  }

  return {
    courseId: section.yearId.courseId._id,
    yearId: section.yearId._id,
    sectionId: section._id,
    courseName: section.yearId.courseId.name,
    yearNumber: section.yearId.yearNumber,
    sectionName: section.name,
    classLabel: getClassLabel({
      courseName: section.yearId.courseId.name,
      yearNumber: section.yearId.yearNumber,
      sectionName: section.name,
    }),
  };
};

const resolveStudentHierarchy = async (studentDoc, { autoCreate = false } = {}) => {
  if (!studentDoc) {
    return null;
  }

  const resolvedFromSectionId = await resolveHierarchyFromSectionId(studentDoc.sectionId);
  if (resolvedFromSectionId) {
    return resolvedFromSectionId;
  }

  if (!autoCreate) {
    return null;
  }

  return ensureAcademicHierarchy({
    courseName: studentDoc.department,
    yearNumber: studentDoc.year,
    sectionName: studentDoc.section,
  });
};

const applyHierarchyToStudent = (studentDoc, hierarchy) => {
  if (!studentDoc || !hierarchy) {
    return studentDoc;
  }

  studentDoc.courseId = hierarchy.courseId;
  studentDoc.yearId = hierarchy.yearId;
  studentDoc.sectionId = hierarchy.sectionId;
  studentDoc.department = hierarchy.courseName;
  studentDoc.year = hierarchy.yearNumber;
  studentDoc.section = hierarchy.sectionName;
  return studentDoc;
};

module.exports = {
  normalizeCourseName,
  normalizeSectionName,
  normalizeYearNumber,
  getClassLabel,
  ensureAcademicHierarchy,
  resolveHierarchyFromSectionId,
  resolveStudentHierarchy,
  applyHierarchyToStudent,
};
