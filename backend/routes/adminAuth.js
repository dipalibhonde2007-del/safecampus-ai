import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import StaffUser from "../models/StaffUser.js";
import AdminOtp from "../models/AdminOtp.js";

const router = express.Router();

// Max 10 requests per 15 minutes (per IP) on the login routes
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// Replace these env names with the ones used in your student login
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
});

// Step 1: send a login code to an approved staff email
router.post("/send-code", limiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const staff = await StaffUser.findOne({ email, active: true });

  if (staff) {
    const code = String(crypto.randomInt(100000, 1000000));

    await AdminOtp.deleteMany({ email }); // remove any old code
    await AdminOtp.create({
      email,
      codeHash: await bcrypt.hash(code, 10), // store only the hash
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // valid for 10 minutes
    });

    await transporter.sendMail({
      from: process.env.MAIL_USER,
      to: email,
      subject: "Admin login code",
      text: `Your login code is ${code}. It is valid for 10 minutes.`,
    });
  }

  // Same reply whether the email is registered or not
  res.json({ message: "If this email is registered, a code has been sent." });
});

// Step 2: verify the code and return a token
router.post("/verify-code", limiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const code = String(req.body.code || "");
  const fail = () => res.status(401).json({ error: "Invalid or expired code" });

  const staff = await StaffUser.findOne({ email, active: true });
  const otp = await AdminOtp.findOne({ email });

  if (!staff || !otp || otp.expiresAt < new Date() || otp.attempts >= 5) {
    return fail();
  }

  const ok = await bcrypt.compare(code, otp.codeHash);
  if (!ok) {
    await AdminOtp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    return fail();
  }

  await AdminOtp.deleteOne({ _id: otp._id }); // a code can be used only once

  const token = jwt.sign(
    { id: staff._id, type: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token, role: staff.role, name: staff.name });
});

export default router;