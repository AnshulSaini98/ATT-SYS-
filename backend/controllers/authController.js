const { User } = require("../models");
const {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  normalizeEmail,
} = require("../utils");

const ALLOWED_ROLES = ["admin", "teacher", "student"];

const sanitizeUser = (userDocument) => ({
  id: userDocument._id,
  name: userDocument.name,
  email: userDocument.email,
  role: userDocument.role,
});

const register = async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body, ["name", "email", "password", "role"]);
    if (missingFields.length > 0) {
      return sendError(res, 400, "All fields are required.");
    }

    const normalizedEmail = normalizeEmail(req.body.email);
    const normalizedRole = String(req.body.role).trim().toLowerCase();

    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return sendError(res, 400, "Role must be admin, teacher, or student.");
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return sendError(res, 409, "Email already registered.");
    }

    const createdUser = await User.create({
      name: req.body.name.trim(),
      email: normalizedEmail,
      password: req.body.password,
      role: normalizedRole,
    });

    return sendSuccess(res, 201, "User registered successfully.", {
      user: sanitizeUser(createdUser),
    });
  } catch (error) {
    if (error.code === 11000) {
      return sendError(res, 409, "Email already registered.");
    }

    return sendServerError(res, "Registration failed.", error);
  }
};

const login = async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body, ["email", "password"]);
    if (missingFields.length > 0) {
      return sendError(res, 400, "Email and password are required.");
    }

    const normalizedEmail = normalizeEmail(req.body.email);

    // Password field is hidden by default in schema, so we include it only for login check.
    const user = await User.findOne({ email: normalizedEmail }).select("+password");
    if (!user) {
      return sendError(res, 401, "Invalid email or password.");
    }

    const isPasswordValid = await user.comparePassword(req.body.password);
    if (!isPasswordValid) {
      return sendError(res, 401, "Invalid email or password.");
    }

    return sendSuccess(res, 200, "Login successful.", {
      user: sanitizeUser(user),
    });
  } catch (error) {
    return sendServerError(res, "Login failed.", error);
  }
};

module.exports = {
  register,
  login,
};
