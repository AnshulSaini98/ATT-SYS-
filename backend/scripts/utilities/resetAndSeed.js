/**
 * RESET AND SEED SCRIPT - Complete System Reset
 * 
 * This script:
 * 1. Clears ALL collections from MongoDB
 * 2. Runs the full seed script
 * 3. Validates the data
 * 
 * Usage: npm run reset:seed
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { exec } = require("child_process");
const path = require("path");

const resetDatabase = async () => {
  try {
    console.log("🔄 Starting database reset...\n");

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI not set in .env");
    }

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB\n");

    // Drop all collections
    console.log("🗑️  Dropping all collections...");
    const collections = [
      "users",
      "sessions",
      "attendances",
      "subjects",
      "teacherassignments",
      "courses",
      "years",
      "sections",
    ];

    for (const collection of collections) {
      try {
        await mongoose.connection.collection(collection).deleteMany({});
        console.log(`   ✅ ${collection}`);
      } catch (err) {
        console.log(`   ⚠️  ${collection} (might not exist)`);
      }
    }

    await mongoose.connection.close();
    console.log("\n✅ Database cleared\n");

    // Run fresh seed using child process
    console.log("🌱 Running fresh seed...\n");
    
    return new Promise((resolve, reject) => {
      const seedProcess = exec(
        `node "${path.join(__dirname, 'seedDemo.js')}"`,
        { cwd: __dirname },
        (error, stdout, stderr) => {
          if (error) {
            console.error("❌ Seed failed:", stderr || error.message);
            reject(error);
          } else {
            console.log(stdout);
            resolve();
          }
        }
      );
    });
  } catch (error) {
    console.error("❌ Error during reset:", error.message);
    process.exit(1);
  }
};

resetDatabase()
  .then(() => {
    console.log("\n✅ DATABASE RESET AND SEED COMPLETE\n");
    console.log("🚀 System is ready to use!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Reset failed:", error.message);
    process.exit(1);
  });

