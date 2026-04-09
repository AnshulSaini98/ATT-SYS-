const jwt = require("jsonwebtoken");
const { sendError } = require("../utils");

/**
 * Middleware to validate JWT token from Authorization header.
 * Extracts user ID from token and attaches to req.user.
 * Route protected with this middleware will reject requests without valid token.
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendError(res, 401, "Missing or invalid authorization token.");
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.userId,
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return sendError(res, 401, "Token has expired. Please login again.");
    }

    if (error.name === "JsonWebTokenError") {
      return sendError(res, 401, "Invalid token. Authentication failed.");
    }

    return sendError(res, 401, "Authentication failed.");
  }
};

/**
 * Optional role-based authorization middleware.
 * Used after authenticate() to further restrict by role.
 * Example: app.post("/admin", authenticate, authorize("admin"), handler)
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, "Authentication required.");
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, `Access denied. Required role: ${allowedRoles.join(" or ")}.`);
    }

    next();
  };
};

module.exports = { authenticate, authorize };
