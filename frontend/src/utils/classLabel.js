const normalizeSection = (value) => String(value || "").trim().toUpperCase();

export const getClassLabel = (value) => {
  const courseName =
    value?.courseName ||
    value?.department ||
    value?.course ||
    "";
  const yearNumber =
    value?.yearNumber ??
    value?.year ??
    "";
  const sectionName =
    value?.sectionName ||
    value?.section ||
    "";

  const normalizedCourse = String(courseName || "").trim();
  const normalizedYear = Number(yearNumber);
  const normalizedSection = normalizeSection(sectionName);
  if (!normalizedCourse || !Number.isInteger(normalizedYear) || !normalizedSection) {
    return "Unknown Class";
  }

  return `${normalizedCourse} Year ${normalizedYear} - Section ${normalizedSection}`;
};
