const sendSuccess = (res, statusCode, message, data = {}) =>
  res.status(statusCode).json({
    success: true,
    message,
    data,
    ...data, // maintain backward-compatible flattened fields used by frontend
  });

const sendError = (res, statusCode, message, error) => {
  const payload = { success: false, message };
  if (error && process.env.NODE_ENV !== "production") {
    payload.error = error;
  }
  return res.status(statusCode).json(payload);
};

const sendServerError = (res, message, error) => sendError(res, 500, message, error?.message || String(error));

module.exports = { sendSuccess, sendError, sendServerError };
