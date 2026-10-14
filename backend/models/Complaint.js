const complaintSchema = new mongoose.Schema(
  {
    studentName: { type: String, default: "Anonymous" },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, default: "General" },
    priority: { type: String, default: "Normal" },
    reason: { type: String, default: "" },
    status: { type: String, default: "New" }
  },
  { timestamps: true }
);