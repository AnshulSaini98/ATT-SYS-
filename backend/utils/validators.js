const mongoose = require("mongoose");

const getMissingFields = (payload, requiredFields) => {
  return requiredFields.filter((field) => {
    const value = payload[field];

    if (value === undefined || value === null) {
      return true;
    }

    if (typeof value === "string") {
      return value.trim() === "";
    }

    return false;
  });
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const normalizeEmail = (email = "") => email.trim().toLowerCase();

module.exports = {
  getMissingFields,
  isValidObjectId,
  normalizeEmail,
};
