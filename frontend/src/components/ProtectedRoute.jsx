import { Navigate } from "react-router-dom";
import { getStoredUser } from "../services";

export const getDefaultPathForUser = (user) => {
  if (!user) {
    return "/";
  }

  if (user.role === "teacher") {
    return "/teacher";
  }

  if (user.role === "student") {
    return "/student";
  }

  return "/";
};

const ProtectedRoute = ({ requiredRole, children }) => {
  const currentUser = getStoredUser();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (currentUser.role !== requiredRole) {
    return <Navigate to={getDefaultPathForUser(currentUser)} replace />;
  }

  return children;
};

export default ProtectedRoute;
