const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({
    message,
    ...data,
  });
};

const sendError = (res, statusCode, message, error) => {
  const payload = { message };

  // Expose error details only in development to keep production responses clean.
  if (error && process.env.NODE_ENV !== "production") {
    payload.error = error;
  }

  return res.status(statusCode).json(payload);
};

const sendServerError = (res, message, error) => {
  return sendError(res, 500, message, error?.message || String(error));
};

module.exports = {
  sendSuccess,
  sendError,
  sendServerError,
};
