const mongoose = require("mongoose");

const ALLOWED_YEARS = [1, 2, 3];

const teacherAssignmentSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
      index: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
      default: "BCA",
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      index: true,
      default: undefined,
    },
    year: {
      type: Number,
      enum: ALLOWED_YEARS,
      required: true,
    },
    yearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Year",
      index: true,
      default: undefined,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      index: true,
      default: undefined,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

teacherAssignmentSchema.index(
  { teacherId: 1, subjectId: 1, year: 1, section: 1 },
  { unique: true }
);
teacherAssignmentSchema.index({ sectionId: 1, teacherId: 1, subjectId: 1 });

module.exports = mongoose.model("TeacherAssignment", teacherAssignmentSchema);
