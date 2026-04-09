/**
 * Utility function to get the default redirect path for a user based on their role
 */
export const getDefaultPathForUser = (user) => {
  if (!user) {
    return "/";
  }

  if (user.role === "admin") {
    return "/admin";
  }

  if (user.role === "teacher") {
    return "/teacher";
  }

  if (user.role === "student") {
    return "/student";
  }

  return "/";
};
