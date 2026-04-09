import { Navigate } from "react-router-dom";
import { getStoredUser } from "../services";
import { getDefaultPathForUser } from "../utils/pathUtils";

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
