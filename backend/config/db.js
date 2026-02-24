const mongoose = require("mongoose");

const connectDatabase = async (mongoUri) => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing in .env file.");
  }

  await mongoose.connect(mongoUri);
  console.log("MongoDB connected.");
};

module.exports = connectDatabase;
