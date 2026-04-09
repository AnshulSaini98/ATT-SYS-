const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const ALLOWED_YEARS = [1, 2, 3];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["admin", "teacher", "student"],
      required: true,
    },
    department: {
      type: String,
      trim: true,
      default: "BCA",
    },
    // Class metadata for department-level hierarchy.
    // Required for new students, but kept backward-compatible for legacy student records.
    year: {
      type: Number,
      enum: ALLOWED_YEARS,
      required: function requiredYearForStudents() {
        return this.role === "student" && (this.isNew || this.isModified("role"));
      },
    },
    section: {
      type: String,
      trim: true,
      uppercase: true,
      required: function requiredSectionForStudents() {
        return this.role === "student" && (this.isNew || this.isModified("role"));
      },
    },
    // Normalized academic hierarchy refs.
    // Student should belong to exactly one section, which implies one year and one course.
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      index: true,
      default: undefined,
    },
    yearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Year",
      index: true,
      default: undefined,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      index: true,
      default: undefined,
    },
    // Student profile fields used in reports/demo datasets.
    rollNo: {
      type: String,
      trim: true,
      uppercase: true,
    },
    fatherName: {
      type: String,
      trim: true,
    },
    phoneNo: {
      type: String,
      trim: true,
    },
    // Optional list of subjects a teacher is allowed to host sessions for.
    // Backward compatible: previously stored as plain strings; now ObjectId refs.
    subjects: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Subject",
        },
      ],
      default: undefined,
    },
    // Basic activation flag so admins can disable accounts without deletion.
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, department: 1, year: 1, section: 1 });
userSchema.index({ role: 1, sectionId: 1 });
userSchema.index({ rollNo: 1 }, { unique: true, sparse: true });

// Hash password only when it is newly set or changed.
userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
