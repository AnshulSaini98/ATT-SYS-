const jwt = require("jsonwebtoken");
const { User } = require("../models");
const {
  sendSuccess,
  sendError,
  sendServerError,
  getMissingFields,
  normalizeEmail,
} = require("../utils");

const ALLOWED_ROLES = ["admin", "teacher", "student"];

/**
 * Generate JWT token for authenticated user.
 * Token expires in 7 days by default.
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const sanitizeUser = (userDocument) => ({
  id: userDocument._id,
  name: userDocument.name,
  email: userDocument.email,
  role: userDocument.role,
  courseId: userDocument.courseId?._id || userDocument.courseId,
  yearId: userDocument.yearId?._id || userDocument.yearId,
  sectionId: userDocument.sectionId?._id || userDocument.sectionId,
  courseName: userDocument.courseId?.name || userDocument.department,
  yearNumber: userDocument.yearId?.yearNumber || userDocument.year,
  sectionName: userDocument.sectionId?.name || userDocument.section,
  department: userDocument.department,
  year: userDocument.year,
  section: userDocument.section,
});

const register = async (req, res) => {
  return sendError(
    res,
    403,
    "Public registration is disabled. Contact your administrator to create an account."
  );
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

    if (user.isActive === false) {
      return sendError(res, 403, "Account is deactivated. Please contact admin.");
    }

    const isPasswordValid = await user.comparePassword(req.body.password);
    if (!isPasswordValid) {
      return sendError(res, 401, "Invalid email or password.");
    }

    await user.populate("courseId", "name");
    await user.populate("yearId", "yearNumber courseId");
    await user.populate("sectionId", "name yearId");

    const token = generateToken(user);

    return sendSuccess(res, 200, "Login successful.", {
      token,
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
