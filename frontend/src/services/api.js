const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const parseApiResponse = async (response) => {
  let payload = {};

  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }

  return payload;
};

const apiRequest = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  return parseApiResponse(response);
};

export const loginUser = (credentials) =>
  apiRequest("/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

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
