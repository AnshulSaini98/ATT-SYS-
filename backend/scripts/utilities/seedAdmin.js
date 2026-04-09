/**
 * Bootstrap script to create the first admin user.
 * Run with: npm run seed:admin
 * Requires ADMIN_EMAIL and ADMIN_PASSWORD in .env
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { User } = require("../models");
const { normalizeEmail } = require("../utils");

const seedAdmin = async () => {
  try {
    // Validate environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const mongoUri = process.env.MONGODB_URI;

    if (!adminEmail || !adminPassword || !mongoUri) {
      console.error(
        "❌ Missing required environment variables: ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI"
      );
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUri);

    const normalizedEmail = normalizeEmail(adminEmail);

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: normalizedEmail, role: "admin" });
    if (existingAdmin) {
      console.log(`✅ Admin already exists: ${existingAdmin.email}`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Create admin user
    console.log("Creating admin user...");
    const admin = await User.create({
      name: "System Administrator",
      email: normalizedEmail,
      password: adminPassword,
      role: "admin",
      isActive: true,
    });

    console.log(`✅ Admin user created successfully!`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   ID: ${admin._id}`);

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding admin:", error.message);
    process.exit(1);
  }
};

seedAdmin();
