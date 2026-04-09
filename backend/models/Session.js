const mongoose = require("mongoose");

const ALLOWED_YEARS = [1, 2, 3];

const sessionSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // New reference for normalized subject linkage; keep `subject` for backward compatibility.
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: undefined,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
      default: "BCA",
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: undefined,
      index: true,
    },
    year: {
      type: Number,
      enum: ALLOWED_YEARS,
      required: function requiredYearForSession() {
        return this.isNew;
      },
    },
    yearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Year",
      default: undefined,
      index: true,
    },
    section: {
      type: String,
      trim: true,
      uppercase: true,
      required: function requiredSectionForSession() {
        return this.isNew;
      },
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      default: undefined,
      index: true,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  { timestamps: true }
);

sessionSchema.index({ teacherId: 1 });
sessionSchema.index({ teacherId: 1, startTime: -1 });
sessionSchema.index({ sectionId: 1, startTime: -1 });
sessionSchema.index({ department: 1, year: 1, section: 1, subject: 1, startTime: -1 });

module.exports = mongoose.model("Session", sessionSchema);
