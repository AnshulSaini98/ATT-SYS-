const mongoose = require("mongoose");

const ALLOWED_YEARS = [1, 2, 3];

const yearSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    yearNumber: {
      type: Number,
      enum: ALLOWED_YEARS,
      required: true,
    },
  },
  { timestamps: true }
);

yearSchema.index({ courseId: 1, yearNumber: 1 }, { unique: true });

module.exports = mongoose.model("Year", yearSchema);
