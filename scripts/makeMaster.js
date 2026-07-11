const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../model/user");

// Load environment variables from ca_sass_back/.env
dotenv.config({ path: path.join(__dirname, "../.env") });

async function run() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error("Usage: node scripts/makeMaster.js <email_or_user_id>");
    process.exit(1);
  }

  console.log(`Connecting to MongoDB...`);
  await connectDB();

  try {
    let query = {};
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      query = { _id: identifier };
    } else {
      query = { email: identifier.trim() };
    }

    const user = await User.findOne(query);
    if (!user) {
      console.error(`User not found with identifier: ${identifier}`);
      process.exit(1);
    }

    user.isMaster = true;
    await user.save();

    console.log(`\nSuccess! User updated:`);
    console.log(`  Name:   ${user.fullName}`);
    console.log(`  Email:  ${user.email}`);
    console.log(`  Master: ${user.isMaster}`);
  } catch (err) {
    console.error("Error updating user:", err);
  } finally {
    await mongoose.connection.close();
    console.log("Database connection closed.");
  }
}

run();