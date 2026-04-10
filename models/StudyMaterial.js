const mongoose = require("mongoose");

const StudyMaterialSchema = new mongoose.Schema(
  {
    // MULTI-TENANT critical
    schoolName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    // 📚 Basic Info
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    subject: { type: String, default: "", index: true },

    // 🎯 Targeting
    className: { type: String, index: true },
    section: { type: String, index: true },

    // 👤 Ownership
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    // 📁 File Data
    fileUrl: String,
    fileType: String,
    fileName: String,
    fileSize: Number,
    publicId: String,

    // 🔗 URL
    url: String,
    urlType: {
      type: String,
      enum: ["none", "youtube", "link"],
      default: "none",
      index: true
    },

    // 📦 Type
    type: {
      type: String,
      enum: ["file", "youtube", "link"],
      default: "file",
      index: true
    },

    // 🏷️ Tags
    tags: [{ type: String, index: true }],

    // ❌ REMOVE THIS (not scalable)
    // completedBy: [...]

    // 🔢 Stats
    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },

    // 🚦 Flags
    isPublic: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },

  },
  { timestamps: true }
);

/* ==========================================
   🚀 INDEXES (VERY IMPORTANT)
========================================== */

// 🔥 MAIN QUERY INDEX (MOST IMPORTANT)
StudyMaterialSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
  subject: 1,
  type: 1
});

// 🔥 SORTING INDEX
StudyMaterialSchema.index({
  schoolName: 1,
  createdAt: -1
});

// 🔥 SEARCH INDEX (SCALABLE)
StudyMaterialSchema.index({
  title: "text",
  description: "text",
  subject: "text",
  tags: "text"
});

// 🔥 TEACHER FILTER
StudyMaterialSchema.index({
  schoolName: 1,
  uploadedBy: 1
});

/* ==========================================
   🧠 AUTO TYPE DETECTION
========================================== */
StudyMaterialSchema.pre("save", function () {
  if (this.url) {
    if (
      this.url.includes("youtube.com") ||
      this.url.includes("youtu.be")
    ) {
      this.urlType = "youtube";
      this.type = "youtube";
    } else {
      this.urlType = "link";
      this.type = "link";
    }
  } else {
    this.urlType = "none";
    this.type = "file";
  }
});

/* ==========================================
   ✅ EXPORT
========================================== */
module.exports = mongoose.model("StudyMaterial", StudyMaterialSchema);