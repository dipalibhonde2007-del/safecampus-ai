// backend/createStudents.js  (standalone, does not need server.js)
// Usage:  node createStudents.js students.csv
require("dotenv").config();
const fs = require("fs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const Student = mongoose.model(
  "Student",
  new mongoose.Schema(
    {
      rollNo: { type: String, required: true, unique: true },
      name: { type: String, required: true },
      codeHash: { type: String, default: null },
      passwordHash: { type: String, default: null },
      registered: { type: Boolean, default: false }
    },
    { timestamps: true }
  )
);

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
  return code;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.log("Usage: node createStudents.js students.csv");
    process.exit(1);
  }

  const lines = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(1);

  await mongoose.connect(process.env.MONGODB_URI);

  const out = ["rollNo,name,code"];
  for (const line of lines) {
    const [rollRaw, ...nameParts] = line.split(",");
    const rollNo = String(rollRaw || "").trim().toUpperCase();
    const name = nameParts.join(",").trim();
    if (!rollNo || !name) continue;

    const existing = await Student.findOne({ rollNo });

    // Student already created an account: do not touch it
    if (existing && existing.registered) {
      console.log(`Skipped ${rollNo} (already has an account)`);
      continue;
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);

    if (existing) {
      existing.name = name;
      existing.codeHash = codeHash;
      await existing.save();
      console.log(`New code for ${rollNo}`);
    } else {
      await Student.create({ rollNo, name, codeHash });
      console.log(`Created ${rollNo}`);
    }

    out.push(`${rollNo},${name},${code}`);
  }

  fs.writeFileSync("codes.csv", out.join("\n"));
  console.log("Done. Codes saved in codes.csv (keep this file private).");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});