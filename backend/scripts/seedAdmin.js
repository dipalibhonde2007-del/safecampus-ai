import "dotenv/config";
import mongoose from "mongoose";
import StaffUser from "../models/StaffUser.js";

// Use the same env name that your server.js uses for MongoDB
await mongoose.connect(process.env.MONGODB_URI);

await StaffUser.create({
  name: "Principal",
  email: "dipalibhonde2007@example.com", // put your real email here
  role: "super_admin",
});

console.log("Super admin created");
process.exit();