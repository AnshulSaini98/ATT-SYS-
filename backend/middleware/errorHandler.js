const { sendError } = require("../utils");

// Global error handler to keep consistent API shape and avoid leaking stack traces.
const errorHandler = (err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || "Internal server error.";
  return sendError(res, status, message, process.env.NODE_ENV !== "production" ? err.stack : undefined);
};

module.exports = errorHandler;
