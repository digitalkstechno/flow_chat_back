const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String },
    status: { type: String, default: "active" },
    isMaster: { type: Boolean, default: false },
    role: { type: String, enum: ["superadmin", "affiliate"], default: "superadmin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
