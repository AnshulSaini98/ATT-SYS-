// Calculate percentage safely with fixed 2 decimals.
const calculatePercentage = (part, total) => {
  if (!total || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
};

// Simple role check helper to keep controller branches tidy.
const hasRole = (user, role) => Boolean(user && user.role === role);

// Validate whether a teacher owns a given subjectId (handles populated or raw ids).
const teacherOwnsSubject = (teacherDoc, subjectId) => {
  if (!teacherDoc || !subjectId || !Array.isArray(teacherDoc.subjects)) return false;
  const target = String(subjectId);
  return teacherDoc.subjects.some((subj) => String(subj._id || subj) === target);
};

module.exports = {
  calculatePercentage,
  hasRole,
  teacherOwnsSubject,
};
