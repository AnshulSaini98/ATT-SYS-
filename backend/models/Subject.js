const mongoose = require("mongoose");

const ALLOWED_YEARS = [1, 2, 3];

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      default: "BCA",
      trim: true,
      set: (value) => String(value || "BCA").trim().toUpperCase(),
    },
    year: {
      type: Number,
      enum: ALLOWED_YEARS,
      required: function requiredYearForSubject() {
        // Keep legacy docs loadable, but prevent creating/updating without year.
        return this.isNew || this.isModified("year");
      },
    },
    // Normalized year reference for strict class-based filtering.
    yearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Year",
      index: true,
      required: function requiredYearIdForSubject() {
        // Keep legacy docs loadable, but prevent creating/updating without yearId.
        return this.isNew || this.isModified("yearId");
      },
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

subjectSchema.index(
  { name: 1, department: 1, year: 1 },
  { unique: true, partialFilterExpression: { year: { $exists: true } } }
);
subjectSchema.index(
  { name: 1, yearId: 1 },
  { unique: true, partialFilterExpression: { yearId: { $exists: true } } }
);

module.exports = mongoose.model("Subject", subjectSchema);
