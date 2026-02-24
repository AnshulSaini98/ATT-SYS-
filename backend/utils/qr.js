const crypto = require("crypto");

const generateSessionToken = () => crypto.randomBytes(16).toString("hex");

// Keep QR payload format explicit so scanner side can parse it reliably.
const buildSessionQrPayload = (sessionToken) =>
  JSON.stringify({
    sessionToken,
  });

module.exports = {
  generateSessionToken,
  buildSessionQrPayload,
};
