require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const multer = require("multer"); // PHOTO
const sharp = require("sharp"); // PHOTO
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(cors());
app.use(express.json());

// PHOTO: max 3 photos, 5 MB each, kept in memory only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 }
});

function handleUpload(req, res, next) {
  upload.array("photos", 3)(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message:
          err.code === "LIMIT_FILE_SIZE"
            ? "Each photo must be under 5 MB"
            : "Upload failed (maximum 3 photos)"
      });
    }
    next();
  });
}

// ---------- Gemini setup ----------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

// ---------- Email setup ----------
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  family: 4,
  connectionTimeout: 10000,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

function getReceivers(category) {
  const map = {
    Ragging: process.env.ALERT_PRINCIPAL,
    Safety: process.env.ALERT_PRINCIPAL,
    "Mental Health": process.env.ALERT_COUNSELOR,
    Infrastructure: process.env.ALERT_MAINTENANCE,
    Academic: process.env.ALERT_ACADEMIC,
    Bullying: process.env.ALERT_COUNSELOR
  };
  return map[category] || process.env.ALERT_TO;
}

async function sendMail(to, subject, text) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !to) {
    console.log("Email not configured, skipping");
    return false;
  }
  try {
    await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
    return true;
  } catch (err) {
    console.error("Email failed:", err.message);
    return false;
  }
}

async function sendComplaintAlert(complaint, result) {
  const urgent = result.priority === "High" ? "URGENT: " : "";
  const to = getReceivers(result.category);
  const ok = await sendMail(
    to,
    `${urgent}New complaint - ${result.category} (${result.priority})`,
    `A new complaint was received.\n\n` +
      `Tracking ID: ${complaint.trackingId}\n` +
      `Routed to: ${to} (${result.category} department)\n` +
      `Filed by: ${complaint.studentName}\n` +
      `Title: ${complaint.title}\n` +
      `Description: ${complaint.description}\n` +
      `Category: ${result.category}\n` +
      `Priority: ${result.priority}\n` +
      `Reason: ${result.reason}\n` +
      `Photos attached: ${complaint.photoCount || 0} (view them in the dashboard)\n` // PHOTO
  );
  if (ok) console.log(`Complaint alert sent to ${to}`);
}

// ---------- Helpers ----------
function normalizeText(title, description) {
  return `${title} ${description}`.toLowerCase().replace(/[’‘`]/g, "'");
}

const URGENT_WORDS = [
  "suicide", "suicidal", "kill myself", "end my life", "want to die",
  "don't want to live", "dont want to live", "do not want to live",
  "no reason to live", "hurt myself", "self harm", "self-harm",
  "better off dead", "आत्महत्या", "जगावेसे वाटत नाही", "मरावेसे वाटते"
];

function checkUrgent(title, description) {
  const text = normalizeText(title, description);
  const hit = URGENT_WORDS.find((w) => text.includes(w));
  if (hit) {
    return {
      category: "Mental Health",
      priority: "High",
      reason: `Safety keyword matched: ${hit}`
    };
  }
  return null;
}

// ---------- Keyword classification (fallback + safety net) ----------
function classifyComplaint(title, description) {
  const text = normalizeText(title, description);

  const rules = [
    {
      words: [
        "kill", "suicide", "hurt myself", "want to die", "threat", "beat", "hit me", "abuse",
        "scared", "afraid", "frighten", "घाबर", "भीती", "धमकी", "मारहाण", "आत्महत्या"
      ],
      category: "Safety",
      priority: "High"
    },
    { words: ["ragg"], category: "Ragging", priority: "High" },
    {
      words: ["tease", "bully", "harass", "mock", "insult", "laugh at"],
      category: "Bullying",
      priority: "Medium"
    },
    {
      words: [
        "lonely", "alone", "depress", "anxious", "anxiety", "stress",
        "cry", "sad", "hopeless", "एकटे", "एकटा", "नैराश्य", "ताण"
      ],
      category: "Mental Health",
      priority: "Medium"
    },
    {
      words: ["teacher", "marks", "exam", "result", "syllabus"],
      category: "Academic",
      priority: "Medium"
    },
    {
      words: ["canteen", "toilet", "water", "bench", "fan", "wifi", "classroom"],
      category: "Infrastructure",
      priority: "Normal"
    }
  ];

  for (const rule of rules) {
    const hit = rule.words.find((w) =>
      /^[\x00-\x7F]+$/.test(w) ? new RegExp(`\\b${w}`).test(text) : text.includes(w)
    );
    if (hit) {
      return {
        category: rule.category,
        priority: rule.priority,
        reason: `Matched keyword: ${hit}`
      };
    }
  }

  return {
    category: "General",
    priority: "Medium",
    reason: "No keyword matched (needs manual review)"
  };
}

// ---------- AI classification (Gemini) ----------
async function classifyWithAI(title, description) {
  const urgent = checkUrgent(title, description);
  if (urgent) return urgent;

  const keywordResult = classifyComplaint(title, description);

  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: "application/json" }
    });

    const prompt =
      "You classify student complaints for a school/college. Reply with ONLY a JSON object: " +
      '{"category": one of ["Safety","Ragging","Bullying","Academic","Infrastructure","Mental Health","General"], ' +
      '"priority": one of ["High","Medium","Normal"], "reason": short sentence}. ' +
      "High = threats, self-harm, suicidal thoughts, abuse, ragging, physical danger. " +
      "Medium = bullying, harassment, loneliness, stress, teacher conduct, academic issues. " +
      "Normal = facilities or general feedback. " +
      "Use category Mental Health for loneliness, depression, anxiety, stress or self-harm. " +
      "The complaint may be in English, Marathi or Hindi.\n\n" +
      `Title: ${title}\nDescription: ${description}`;

    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break;
      } catch (err) {
        const retryable = /503|429|overloaded|high demand/i.test(err.message);
        if (!retryable || attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }

    const text = result.response.text().replace(/```json|```/g, "").trim();
    const ai = JSON.parse(text);

    const categories = ["Safety", "Ragging", "Bullying", "Academic", "Infrastructure", "Mental Health", "General"];
    const priorities = ["High", "Medium", "Normal"];
    if (!categories.includes(ai.category) || !priorities.includes(ai.priority)) {
      throw new Error("Invalid AI output");
    }

    if (keywordResult.priority === "High" && ai.priority !== "High") {
      return { ...keywordResult, reason: `Keyword safety rule: ${keywordResult.reason}` };
    }

    return { category: ai.category, priority: ai.priority, reason: `AI: ${ai.reason}` };
  } catch (error) {
    console.error("AI classification failed, using keywords:", error.message);
    return keywordResult;
  }
}

// ---------- Schemas ----------
const complaintSchema = new mongoose.Schema(
  {
    trackingId: { type: String, index: true },
    studentName: { type: String, default: "Anonymous" },
    anonymous: { type: Boolean, default: false },
    // Set only for NON-anonymous complaints. Anonymous ones are never linked to an account.
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", default: null, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, default: "General" },
    priority: { type: String, default: "Normal" },
    reason: { type: String, default: "" },
    status: { type: String, default: "New" },
    escalated: { type: Boolean, default: false },
    attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Attachment" }], // PHOTO
    // Only for anonymous complaints where the student wants a "resolved" email.
    // select:false = never returned by normal queries, so admins can never see it.
    notifyEmail: { type: String, default: null, select: false },
    notifyName: { type: String, default: null, select: false },
    // live chat between the student and the admin team
    chatKey: { type: String, default: null, select: false },
    chatLastFrom: { type: String, default: null },
    chatLastAt: { type: Date, default: null },
    messages: {
      type: [{ from: String, text: String, at: { type: Date, default: Date.now } }],
      default: [],
      select: false
    }
  },
  { timestamps: true }
);

const Complaint = mongoose.model("Complaint", complaintSchema);

const studentSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    verified: { type: Boolean, default: false },
    otpHash: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    otpSentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// stored in a new "users" collection
const Student = mongoose.model("Student", studentSchema, "users");

// PHOTO: evidence photos are stored here, never in a public folder
const attachmentSchema = new mongoose.Schema(
  {
    data: Buffer,
    contentType: { type: String, default: "image/jpeg" }
  },
  { timestamps: true }
);
const Attachment = mongoose.model("Attachment", attachmentSchema);

// A NEW random tracking ID for every complaint, e.g. CMP-7K3QX9.
// Checks the database so the same ID is never used twice.
async function generateTrackingId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 10; attempt++) {
    let id = "CMP-";
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    const exists = await Complaint.exists({ trackingId: id });
    if (!exists) return id;
  }
  return "CMP-" + Date.now().toString(36).toUpperCase();
}

// ---------- Admin roles ----------
// .env format: ADMIN_EMAILS=a@x.com:super_admin,b@x.com:counsellor,c@x.com:teacher
// An email with no role is treated as "teacher" (least access).
const ADMIN_ROLES = ["super_admin", "counsellor", "teacher"];

function getAdminMap() {
  const map = {};
  (process.env.ADMIN_EMAILS || "").split(",").forEach((item) => {
    const [email, role] = item.trim().toLowerCase().split(":");
    if (email) map[email] = ADMIN_ROLES.includes(role) ? role : "teacher";
  });
  return map;
}

const getAdminEmails = () => Object.keys(getAdminMap());
const getAdminRole = (email) => getAdminMap()[email] || null;

// Teachers only see these categories, and never High priority reports.
// Add "Academic" here if teachers should also handle academic complaints.
const TEACHER_CATEGORIES = ["Infrastructure"];

function complaintScope(role) {
  if (role === "teacher") {
    return { category: { $in: TEACHER_CATEGORIES }, priority: { $ne: "High" } };
  }
  return {}; // super_admin and counsellor see everything
}

// ---------- Auth middleware ----------
function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function requireAdmin(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ message: "Login required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // A student token must never open admin routes
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    // The role is read from .env on every request,
    // so a removed teacher loses access immediately.
    const adminRole =
      decoded.email === "backup-admin" ? "super_admin" : getAdminRole(decoded.email);
    if (!adminRole) {
      return res.status(403).json({ message: "Admin access removed" });
    }

    req.adminRole = adminRole;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireStudent(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ message: "Login required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "student") {
      return res.status(403).json({ message: "Student login required" });
    }
    req.studentId = decoded.id;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// ---------- Email login helpers (no password, only a code sent to the email) ----------
const normEmail = (v) => String(v || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signStudentToken(student) {
  return jwt.sign(
    { role: "student", id: student._id.toString() },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function signAdminToken(email) {
  return jwt.sign({ role: "admin", email }, process.env.JWT_SECRET, {
    expiresIn: "8h"
  });
}

// ---------- Backup admin login (ADMIN_USERNAME / ADMIN_PASSWORD from .env) ----------
// Tip: delete ADMIN_USERNAME and ADMIN_PASSWORD from .env to switch this route off.
app.post("/api/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");

  if (
    process.env.ADMIN_USERNAME &&
    process.env.ADMIN_PASSWORD &&
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    return res.json({ token: signAdminToken("backup-admin") });
  }

  res.status(401).json({ message: "Wrong username or password" });
});

// ---------- Email login: step 1, send a 6-digit code ----------
// body: { email, name?, as? }   as = "admin" for the admin page
app.post("/api/auth/send-code", async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    let name = String(req.body.name || "").trim().slice(0, 60);
    const asAdmin = req.body.as === "admin";

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email" });
    }

    if (asAdmin && !getAdminEmails().includes(email)) {
      return res.status(403).json({ message: "This email is not an admin email" });
    }

    // Optional: allow only your college email domain, e.g. ALLOWED_EMAIL_DOMAIN=mycollege.edu
    const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN || "").trim().toLowerCase();
    if (!asAdmin && allowedDomain && !email.endsWith("@" + allowedDomain)) {
      return res.status(400).json({ message: `Please use your @${allowedDomain} email` });
    }

    let user = await Student.findOne({ email });

    if (!user) {
      if (asAdmin && !name) name = "Admin";
      if (!name) {
        // New email: ask the website to collect the name first
        return res.json({ needName: true });
      }
      user = new Student({ email, name });
    } else if (name && !user.verified) {
      user.name = name;
    }

    if (user.otpSentAt && Date.now() - user.otpSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({ message: "Please wait a minute before asking for a new code." });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    user.otpHash = await bcrypt.hash(otp, 10);
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.otpAttempts = 0;
    user.otpSentAt = new Date();
    await user.save();

    const ok = await sendMail(
      email,
      "Your login code",
      `Hello ${user.name},\n\n` +
        `Your login code for the Grievance Portal is: ${otp}\n\n` +
        `It is valid for 10 minutes. If you did not ask for it, ignore this email.`
    );
    if (!ok) {
      return res.status(500).json({
        message: "Could not send the email. Check EMAIL_USER and EMAIL_PASS on the server."
      });
    }

    res.json({ message: "Code sent. Check your Inbox and Spam folder." });
  } catch (err) {
    console.error("Send code error:", err);
    res.status(500).json({ message: "Failed to send code" });
  }
});

// ---------- Email login: step 2, check the code ----------
// body: { email, code, as? }
app.post("/api/auth/verify", async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const code = String(req.body.code || "").trim();
    const asAdmin = req.body.as === "admin";

    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }
    if (asAdmin && !getAdminEmails().includes(email)) {
      return res.status(403).json({ message: "This email is not an admin email" });
    }

    const user = await Student.findOne({ email });
    if (!user || !user.otpHash || !user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "Code expired or invalid. Please request a new code." });
    }
    if (user.otpAttempts >= 5) {
      return res.status(429).json({ message: "Too many wrong attempts. Please request a new code." });
    }

    const match = await bcrypt.compare(code, user.otpHash);
    if (!match) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(400).json({ message: "Wrong code. Please try again." });
    }

    user.verified = true;
    user.otpHash = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    await user.save();

    if (asAdmin) {
      return res.json({
        token: signAdminToken(email),
        role: "admin",
        adminRole: getAdminRole(email)
      });
    }

    res.json({
      token: signStudentToken(user),
      role: "student",
      student: { name: user.name, email: user.email }
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

// ---------- Routes ----------
// This text confirms the NEW server (with email login) is the one running
app.get("/", (req, res) => {
  res.send("AI Complaint System Backend is running! (tracking IDs + email-code login + live chat enabled)");
});

// Students submit (login required). PHOTO: accepts up to 3 photos in field "photos"
app.post("/api/complaints", requireStudent, handleUpload, async (req, res) => {
  try {
    const { title, description, anonymous } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        message: "Title and description are required"
      });
    }

    const student = await Student.findById(req.studentId);
    if (!student) {
      return res.status(401).json({ message: "Login required" });
    }

    const isAnonymous = anonymous === true || anonymous === "true";
    // student can untick "Email me when resolved" (used for anonymous complaints)
    const wantsEmail = !(req.body.notify === false || req.body.notify === "false");

    const analysis = await classifyWithAI(title, description);
    const trackingId = await generateTrackingId();

    // PHOTO: strip metadata (GPS, device info) and re-encode every photo as JPEG
    const attachmentIds = [];
    for (const file of req.files || []) {
      try {
        const clean = await sharp(file.buffer)
          .rotate()
          .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        const doc = await Attachment.create({ data: clean });
        attachmentIds.push(doc._id);
      } catch (e) {
        await Attachment.deleteMany({ _id: { $in: attachmentIds } });
        return res.status(400).json({ message: "Only image files (JPG, PNG, WEBP) are allowed" });
      }
    }

    // secret key for this complaint's chat (lets an anonymous student open the chat)
    const chatKey = crypto.randomBytes(16).toString("hex");

    const complaint = new Complaint({
      trackingId,
      chatKey,
      // Name always comes from the logged-in account, never from the form
      studentName: isAnonymous ? "Anonymous" : student.name,
      // Anonymous complaints are NOT linked to the account
      studentId: isAnonymous ? null : student._id,
      anonymous: isAnonymous,
      title,
      description,
      category: analysis.category,
      priority: analysis.priority,
      reason: analysis.reason,
      attachments: attachmentIds, // PHOTO
      // Private "resolved" email for anonymous complaints. Hidden from admins, deleted after use.
      notifyEmail: isAnonymous && wantsEmail ? student.email : null,
      notifyName: isAnonymous && wantsEmail ? student.name : null
    });

    await complaint.save();
    console.log(`New complaint saved with tracking ID ${trackingId}`);

    sendComplaintAlert(
      {
        trackingId,
        studentName: complaint.studentName,
        title,
        description,
        photoCount: attachmentIds.length // PHOTO
      },
      analysis
    );

    res.status(201).json({
      message: "Complaint submitted successfully",
      trackingId,
      chatKey,
      complaint: {
        trackingId,
        title: complaint.title,
        category: complaint.category,
        status: complaint.status,
        anonymous: complaint.anonymous,
        createdAt: complaint.createdAt
      }
    });
  } catch (error) {
    console.error("Complaint error:", error);
    res.status(500).json({ message: "Failed to save complaint" });
  }
});

// Student only: ONLY the logged-in student's own (non-anonymous) complaints
app.get("/api/my-complaints", requireStudent, async (req, res) => {
  try {
    const list = await Complaint.find({ studentId: req.studentId })
      .sort({ createdAt: -1 })
      .select("trackingId title description category status createdAt updatedAt chatLastFrom chatLastAt");
    res.json(list);
  } catch (error) {
    console.error("My complaints error:", error);
    res.status(500).json({ message: "Failed to load complaints" });
  }
});

// Public: students check status with their tracking ID.
// Returns ONLY non-private details (never the description or name).
app.get("/api/track/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim().toUpperCase();
    const complaint = await Complaint.findOne({ trackingId: id });

    if (!complaint) {
      return res.status(404).json({ message: "No complaint found with this ID" });
    }

    res.json({
      trackingId: complaint.trackingId,
      title: complaint.title,
      category: complaint.category,
      status: complaint.status === "Pending" ? "New" : complaint.status,
      submittedAt: complaint.createdAt,
      lastUpdated: complaint.updatedAt,
      chatLastFrom: complaint.chatLastFrom,
      chatLastAt: complaint.chatLastAt
    });
  } catch (error) {
    console.error("Track error:", error);
    res.status(500).json({ message: "Failed to look up complaint" });
  }
});

// Admin only: get complaints (High first), filtered by the admin's role
app.get("/api/complaints", requireAdmin, async (req, res) => {
  try {
    const complaints = await Complaint.find(complaintScope(req.adminRole))
      .sort({ createdAt: -1 })
      .select("-studentId")
      .lean();

    // Teachers never see who filed a complaint
    if (req.adminRole === "teacher") {
      complaints.forEach((c) => {
        c.studentName = "Hidden";
      });
    }

    const order = { High: 0, Medium: 1, Normal: 2 };
    complaints.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3));

    res.json(complaints);
  } catch (error) {
    console.error("Fetch complaints error:", error);
    res.status(500).json({ message: "Failed to fetch complaints" });
  }
});

// PHOTO: Admin only, view one photo, only if this admin's role may see that complaint
app.get("/api/attachments/:id", requireAdmin, async (req, res) => {
  try {
    const att = await Attachment.findById(req.params.id);
    if (!att) return res.sendStatus(404);

    const complaint = await Complaint.findOne({
      attachments: att._id,
      ...complaintScope(req.adminRole)
    });
    if (!complaint) return res.sendStatus(404);

    res.set("Content-Type", "image/jpeg");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, no-store");
    res.send(att.data);
  } catch (err) {
    res.sendStatus(400);
  }
});

// Admin only: statistics (only for the reports this role may see)
app.get("/api/stats", requireAdmin, async (req, res) => {
  try {
    const scope = complaintScope(req.adminRole);

    const countBy = async (field) => {
      const rows = await Complaint.aggregate([
        { $match: scope },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } }
      ]);
      const out = {};
      rows.forEach((r) => (out[r._id] = r.count));
      return out;
    };

    res.json({
      total: await Complaint.countDocuments(scope),
      byCategory: await countBy("category"),
      byPriority: await countBy("priority"),
      byStatus: await countBy("status")
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ message: "Failed to load stats" });
  }
});

// Admin only: update status. When a complaint becomes "Resolved", the student is emailed.
app.patch("/api/complaints/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["New", "In Review", "Resolved", "Escalated"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const complaint = await Complaint.findOne({
      _id: req.params.id,
      ...complaintScope(req.adminRole)
    }).select("+notifyEmail +notifyName");

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    const oldStatus = complaint.status;
    complaint.status = status;
    console.log(`[status] ${complaint.trackingId}: ${oldStatus} -> ${status}`);

    let studentNotified = false;

    if (status !== "Resolved") {
      // nothing to email
    } else if (oldStatus === "Resolved") {
      console.log("[email] Skipped: this complaint was already Resolved. Change it to another status first, then back to Resolved.");
    } else {
      let toEmail = null;
      let toName = "Student";

      if (complaint.studentId) {
        const student = await Student.findById(complaint.studentId);
        if (student) {
          toEmail = student.email;
          toName = student.name;
        } else {
          console.log("[email] Skipped: the student account was not found in the database.");
        }
      } else if (complaint.notifyEmail) {
        toEmail = complaint.notifyEmail;
        toName = complaint.notifyName || "Student";
      } else {
        console.log("[email] Skipped: anonymous complaint with no saved email (the student unticked it, or it was made before this feature).");
      }

      if (toEmail) {
        console.log(`[email] Sending resolved email to ${toEmail} ...`);
        studentNotified = await sendMail(
          toEmail,
          `Your complaint has been resolved (${complaint.trackingId})`,
          `Hello ${toName},\n\n` +
            `Good news! Your complaint has been marked as Resolved.\n\n` +
            `Tracking ID: ${complaint.trackingId}\n` +
            `Title: ${complaint.title}\n\n` +
            `You can check the details anytime in the Grievance Portal using your tracking ID.\n` +
            `If the problem is not fully solved, please submit a new complaint or chat with the admin team.\n\n` +
            `Thank you for speaking up.`
        );
        if (studentNotified) {
          console.log(`[email] Resolved email sent for ${complaint.trackingId}`);
          // privacy: delete the saved anonymous email once it has been used
          complaint.notifyEmail = null;
          complaint.notifyName = null;
        } else {
          console.log("[email] FAILED to send. Check the 'Email failed' line above and EMAIL_USER / EMAIL_PASS in .env.");
        }
      }
    }

    await complaint.save();

    // never send private fields back to the browser
    const out = complaint.toObject();
    delete out.studentId;
    delete out.notifyEmail;
    delete out.notifyName;
    delete out.chatKey;
    delete out.messages;
    res.json({ ...out, studentNotified });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
});

// ---------- Live chat (student <-> admin team) ----------
const MAX_MSG = 1000;
const MAX_MESSAGES = 300;
const cleanText = (v) => String(v || "").trim().slice(0, MAX_MSG);

function sameKey(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function addMessage(complaint, from, text) {
  complaint.messages.push({ from, text });
  if (complaint.messages.length > MAX_MESSAGES) {
    complaint.messages = complaint.messages.slice(-MAX_MESSAGES);
  }
  complaint.chatLastFrom = from;
  complaint.chatLastAt = new Date();
  await complaint.save();
}

const chatView = (c) => ({
  status: c.status,
  messages: (c.messages || []).map((m) => ({ from: m.from, text: m.text, at: m.at }))
});

// Student side: allowed if logged in as the owner (non-anonymous),
// or if the request carries this complaint's secret chat key (anonymous).
async function loadStudentChat(req, res, next) {
  try {
    const id = String(req.params.trackingId || "").trim().toUpperCase();
    const complaint = await Complaint.findOne({ trackingId: id }).select("+chatKey +messages");
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });

    let ok = false;
    const token = getToken(req);
    if (token && complaint.studentId) {
      try {
        const d = jwt.verify(token, process.env.JWT_SECRET);
        if (d.role === "student" && d.id === complaint.studentId.toString()) ok = true;
      } catch (e) {}
    }
    const key = String(req.headers["x-chat-key"] || "");
    if (!ok && key && complaint.chatKey && sameKey(key, complaint.chatKey)) ok = true;

    if (!ok) return res.status(403).json({ message: "You cannot open this chat" });
    req.complaint = complaint;
    next();
  } catch (err) {
    console.error("Chat access error:", err);
    res.status(500).json({ message: "Chat failed" });
  }
}

app.get("/api/chat/:trackingId", loadStudentChat, (req, res) => {
  res.json(chatView(req.complaint));
});

app.post("/api/chat/:trackingId", loadStudentChat, async (req, res) => {
  try {
    const text = cleanText(req.body.text);
    if (!text) return res.status(400).json({ message: "Type a message first" });
    await addMessage(req.complaint, "student", text);
    res.json(chatView(req.complaint));
  } catch (err) {
    console.error("Chat send error:", err);
    res.status(500).json({ message: "Could not send the message" });
  }
});

// Admin side: only for complaints this admin's role may see
app.get("/api/admin/chat/:id", requireAdmin, async (req, res) => {
  try {
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      ...complaintScope(req.adminRole)
    }).select("+messages");
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });
    res.json(chatView(complaint));
  } catch (err) {
    res.status(400).json({ message: "Could not open the chat" });
  }
});

app.post("/api/admin/chat/:id", requireAdmin, async (req, res) => {
  try {
    const text = cleanText(req.body.text);
    if (!text) return res.status(400).json({ message: "Type a message first" });
    const complaint = await Complaint.findOne({
      _id: req.params.id,
      ...complaintScope(req.adminRole)
    }).select("+messages");
    if (!complaint) return res.status(404).json({ message: "Complaint not found" });
    await addMessage(complaint, "admin", text);
    res.json(chatView(complaint));
  } catch (err) {
    console.error("Admin chat error:", err);
    res.status(400).json({ message: "Could not send the message" });
  }
});

// ---------- Escalation reminder ----------
async function checkEscalations() {
  try {
    const minutes = Number(process.env.ESCALATION_MINUTES) || 2880;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);

    const overdue = await Complaint.find({
      priority: "High",
      status: "New",
      escalated: false,
      createdAt: { $lte: cutoff }
    });

    for (const c of overdue) {
      const to = process.env.ALERT_PRINCIPAL || process.env.ALERT_TO;
      const ok = await sendMail(
        to,
        `ESCALATION: High priority complaint not reviewed (${c.category})`,
        `This High priority complaint has not been reviewed for ${minutes} minutes.\n\n` +
          `Tracking ID: ${c.trackingId || "-"}\n` +
          `Filed by: ${c.studentName}\n` +
          `Title: ${c.title}\n` +
          `Description: ${c.description}\n` +
          `Category: ${c.category}\n` +
          `Filed at: ${c.createdAt.toLocaleString()}\n\n` +
          `Please review it in the dashboard.`
      );
      if (ok) {
        c.escalated = true;
        await c.save();
        console.log(`Escalation sent for complaint ${c._id}`);
      }
    }
  } catch (err) {
    console.error("Escalation check failed:", err.message);
  }
}

// ---------- MongoDB connection ----------
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully");

    setInterval(checkEscalations, 60 * 1000);

    app.listen(process.env.PORT || 5000, () => {
      console.log("Server running on port 5000 (tracking IDs + email-code login + live chat enabled)");
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });