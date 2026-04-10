const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 🔥 Denormalized student data (avoid populate)
    studentName: {
      type: String,
      trim: true,
    },

    rollNumber: {
      type: String,
      trim: true,
    },

    className: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    section: {
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

    status: {
      type: String,
      enum: ["Present", "Absent", "Late", "Leave"],
      required: true,
    },

    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * ===============================
 * 🔥 CRITICAL INDEXES
 * ===============================
 */

// ✅ Fast class attendance queries
attendanceSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
  date: -1,
});

// ✅ Student history queries
attendanceSchema.index({
  studentId: 1,
  date: -1,
});

// ✅ Unread queries (VERY IMPORTANT)
attendanceSchema.index({
  studentId: 1,
  isRead: 1,
});

// ✅ School-wide unread (for admin dashboards)
attendanceSchema.index({
  schoolName: 1,
  isRead: 1,
});

// ✅ Prevent duplicate attendance (CRITICAL)
attendanceSchema.index(
  { studentId: 1, date: 1, schoolName: 1 },
  { unique: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);