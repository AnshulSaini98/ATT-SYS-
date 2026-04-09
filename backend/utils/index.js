const { sendSuccess, sendError, sendServerError } = require("./response");
const { getMissingFields, isValidObjectId, normalizeEmail } = require("./validators");
const { generateSessionToken, buildSessionQrPayload } = require("./qr");
const { calculatePercentage, hasRole, teacherOwnsSubject } = require("./helpers");
const {
  normalizeCourseName,
  normalizeSectionName,
  normalizeYearNumber,
  getClassLabel,
  ensureAcademicHierarchy,
  resolveHierarchyFromSectionId,
  resolveStudentHierarchy,
  applyHierarchyToStudent,
} = require("./academicHierarchy");

module.exports = {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  isValidObjectId,
  normalizeEmail,
  generateSessionToken,
  buildSessionQrPayload,
  calculatePercentage,
  hasRole,
  teacherOwnsSubject,
  normalizeCourseName,
  normalizeSectionName,
  normalizeYearNumber,
  getClassLabel,
  ensureAcademicHierarchy,
  resolveHierarchyFromSectionId,
  resolveStudentHierarchy,
  applyHierarchyToStudent,
};
