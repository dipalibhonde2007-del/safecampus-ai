import mongoose from "mongoose";

const staffUserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ["super_admin", "teacher", "counsellor"], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("StaffUser", staffUserSchema);