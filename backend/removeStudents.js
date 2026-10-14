require("dotenv").config();
const mongoose = require("mongoose");

const Student = mongoose.model(
  "Student",
  new mongoose.Schema({ rollNo: String }, { strict: false })
);

async function main() {
  const rolls = process.argv.slice(2).map((r) => r.trim().toUpperCase());
  if (rolls.length === 0) {
    console.log("Usage: node removeStudents.js 101 102");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await Student.deleteMany({ rollNo: { $in: rolls } });
  console.log(`Removed ${result.deletedCount} student(s): ${rolls.join(", ")}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});