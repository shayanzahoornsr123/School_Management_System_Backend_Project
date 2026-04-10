const mongoose = require("mongoose");

// 🔥 Subdocument Schema (optimized)
const submissionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, 
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    fileUrl: { type: String, default: "" },
    filePublicId: { type: String, default: "" },
    fileType: { type: String, default: "" },

    grade: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },

    feedback: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ["Pending", "Submitted", "Graded"],
      default: "Pending",
    },
  },
  { _id: false } // 🔥 VERY IMPORTANT (memory optimization)
);

// 🔥 Main Schema
const assignmentSchema = new mongoose.Schema(
  {
    // Basic Info
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    schoolName: {
      type: String,
      required: true,
      index: true,
    },

    className: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },

    section: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },

    dueDate: {
      type: Date,
      required: true,
      index: true,
    },

    // File Attachments
    fileUrl: { type: String, default: "" },
    filePublicId: { type: String, default: "" },
    fileType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },

    // Creator
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Optimization (remove heavy populate later if needed)
    createdByName: {
      type: String,
      trim: true,
    },

    // Versioning
    version: {
      type: Number,
      default: 1,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ⚠️ Submissions (kept as you requested)
    submissions: {
      type: [submissionSchema],
      default: [],

      // 🔥 HARD LIMIT to prevent document crash
      validate: [
        {
          validator: function (arr) {
            return arr.length <= 500;
          },
          message: "Too many submissions in one assignment",
        },
      ],
    },

    // 🔥 Counters (performance boost)
    totalSubmissions: {
      type: Number,
      default: 0,
    },

    totalGraded: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * ===============================
 * 🔥 INDEXES (FIXED + SCALABLE)
 * ===============================
 */

// Main query
assignmentSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
  dueDate: -1,
});

// Subject filtering
assignmentSchema.index({
  schoolName: 1,
  subject: 1,
});

// Teacher dashboard
assignmentSchema.index({
  createdBy: 1,
  dueDate: -1,
});

// 🔥 Text search
assignmentSchema.index({
  title: "text",
  description: "text",
  subject: "text",
});

/**
 * ===============================
 * 🔥 AUTO COUNTERS
 * ===============================
 */
assignmentSchema.pre("save", async function () {
  if (this.submissions) {
    this.totalSubmissions = this.submissions.length;
    this.totalGraded = this.submissions.filter(
      (s) => s.status === "Graded"
    ).length;
  }
});

module.exports = mongoose.model("Assignment", assignmentSchema);