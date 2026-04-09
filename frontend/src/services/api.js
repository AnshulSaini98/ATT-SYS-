import { getStoredToken, setStoredToken, clearAllAuth } from "./authStorage";

// API base resolution: prefer explicit VITE_API_BASE_URL, otherwise same origin (or localhost in dev).
const resolvedApiBase =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "") ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");

// Normalize trailing slashes to keep request composition predictable.
const API_BASE_URL = resolvedApiBase.replace(/\/+$/, "");

if (import.meta.env.DEV) {
  console.log("[api] base URL:", API_BASE_URL);
}

// Simple fetch wrapper with timeout
const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`Request timeout after ${timeoutMs}ms: ${url}`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("Fetch error:", error);
    throw error;
  }
};

const parseApiResponse = async (response) => {
  let payload = {};
  try {
    const text = await response.text();
    if (text) {
      payload = JSON.parse(text);
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Could not parse response as JSON:", error);
    }
    payload = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAllAuth();
    }
    const message = payload.message || `HTTP ${response.status}`;
    return { success: false, message, status: response.status };
  }

  return { success: true, ...(typeof payload === "object" ? payload : {}) };
};

const apiRequest = async (path, options = {}) => {
  try {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    const token = getStoredToken();
    if (token && !path.includes("/login") && !path.includes("/register")) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = `${API_BASE_URL}${path}`;
    if (import.meta.env.DEV) {
      console.log(`[api] ${options.method || "GET"} ${path}`);
    }

    const response = await fetchWithTimeout(url, {
      ...options,
      headers,
    });

    const parsed = await parseApiResponse(response);

    if (parsed.success === false) {
      console.error(`API error: ${parsed.message}`);
      throw new Error(parsed.message || "Request failed");
    }

    if (import.meta.env.DEV) {
      console.log(`[api] ${response.status} ${path}`);
    }
    return parsed;
  } catch (error) {
    console.error(`Request failed: ${path}`, error);
    throw new Error(error?.message || "Network request failed");
  }
};

export const loginUser = async (credentials) => {
  const response = await apiRequest("/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

  // Store JWT token if login successful
  if (response.success && response.token) {
    setStoredToken(response.token);
  }

  return response;
};

export const startTeacherSession = (payload) =>
  apiRequest("/start-session", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const endTeacherSession = (payload) =>
  apiRequest("/end-session", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const submitAttendance = (payload) =>
  apiRequest("/mark-attendance", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getSessionAttendanceSummary = (sessionId) =>
  apiRequest(`/session-attendance/${sessionId}`, {
    method: "GET",
  });

export const manualAttendance = (payload) =>
  apiRequest("/teacher/manual-attendance", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const unmarkAttendance = (payload) =>
  apiRequest("/teacher/unmark-attendance", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getStudentSubjectSummary = (studentId = "") =>
  apiRequest(`/student/subject-summary${studentId ? `/${studentId}` : ""}`, {
    method: "GET",
  });

export const getStudentProfile = () =>
  apiRequest("/student/me", {
    method: "GET",
  });

// Teacher session history (last few sessions with counts)
export const fetchTeacherSessions = (teacherId) =>
  apiRequest(`/teacher-sessions/${teacherId}`, {
    method: "GET",
  });

export const getTeacherSubjectSummary = (teacherId) =>
  apiRequest(`/teacher/subject-summary/${teacherId}`, {
    method: "GET",
  });

export const getTeacherDefaulters = (teacherId) =>
  apiRequest(`/teacher/defaulters/${teacherId}`, {
    method: "GET",
  });

export const getTeacherSubjects = () =>
  apiRequest("/teacher/subjects", {
    method: "GET",
  });

// Admin user management
export const fetchManagedUsers = ({ role } = {}) => {
  const roleQuery = role ? `?role=${encodeURIComponent(role)}` : "";
  return apiRequest(`/admin/users${roleQuery}`, {
    method: "GET",
  });
};

export const fetchClasses = () =>
  apiRequest("/admin/classes", {
    method: "GET",
  });

export const createManagedUser = (payload) =>
  apiRequest("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateManagedUser = (userId, payload) =>
  apiRequest(`/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteManagedUser = (userId, payload) =>
  apiRequest(`/admin/users/${userId}`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });

export const toggleUserActive = (userId, payload) =>
  apiRequest(`/admin/toggle-user/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const getSystemSummary = () =>
  apiRequest("/admin/system-summary", {
    method: "GET",
  });

export const getSessionLog = () =>
  apiRequest("/admin/session-log", {
    method: "GET",
  });

// Student attendance history (admin)
export const getStudentAttendanceHistory = (studentId, { startDate, endDate } = {}) => {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/admin/students/${studentId}/attendance${query}`, { method: "GET" });
};

// Export attendance report as CSV (admin)
export const exportAttendanceReport = () =>
  apiRequest("/admin/export/attendance", { method: "GET" });

// Subject management
export const createSubject = (payload) =>
  apiRequest("/admin/subjects", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchSubjects = () =>
  apiRequest("/admin/subjects", {
    method: "GET",
  });

export const deleteSubject = (subjectId, adminId) =>
  apiRequest(`/admin/subjects/${subjectId}?adminId=${encodeURIComponent(adminId)}`, {
    method: "DELETE",
  });

export const assignTeacherSubjects = (teacherId, payload) =>
  apiRequest(`/admin/assign-subjects/${teacherId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

// Class subject and teacher management
export const getClassSubjects = (sectionId) =>
  apiRequest(`/admin/classes/${sectionId}/subjects`, {
    method: "GET",
  });

export const getClassTeachers = (sectionId) =>
  apiRequest(`/admin/classes/${sectionId}/teachers`, {
    method: "GET",
  });

export const assignSubjectsToClass = (sectionId, payload) =>
  apiRequest(`/admin/classes/${sectionId}/assign-subjects`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

// Year subject management
export const getYearSubjects = (yearId) =>
  apiRequest(`/admin/years/${yearId}/subjects`, {
    method: "GET",
  });
