const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema(
  {
    yearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Year",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
  },
  { timestamps: true }
);

sectionSchema.index({ yearId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Section", sectionSchema);
