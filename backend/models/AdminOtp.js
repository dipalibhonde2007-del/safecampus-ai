import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  email: { type: String, index: true },
  codeHash: String,
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, expires: 0 }, // वेळ संपली की MongoDB आपोआप delete करतो
});

export default mongoose.model("AdminOtp", otpSchema);