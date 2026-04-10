const mongoose = require("mongoose");

/* ======================================================
   📘 SUBJECT SUB-SCHEMA
====================================================== */
const subjectSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    day: { type: String, required: true, trim: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    roomNumber: { type: String, trim: true },
  },
  { _id: false }
);

/* ======================================================
   📘 DATASHEET SCHEMA
====================================================== */
const dateSheetSchema = new mongoose.Schema(
  {
    schoolName: {
      type: String,
      required: true,
      trim: true,
      index: true, // school isolation
    },

    className: {
      type: String,
      required: true,
      trim: true,
    },

    section: {
      type: String,
      required: true,
      trim: true,
    },

    examType: {
      type: String,
      required: true,
      trim: true,
    },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    subjects: {
      type: [subjectSchema],
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* ======================================================
   🔥 CRITICAL INDEXES (SCALABILITY CORE)
====================================================== */

// ✅ Main filtering (MOST IMPORTANT)
dateSheetSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
  examType: 1,
});

// ✅ Fast class-level fetch
dateSheetSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
});

// ✅ Sorting optimization
dateSheetSchema.index({
  createdAt: -1,
});

// ✅ Teacher queries (admin panel)
dateSheetSchema.index({
  teacherId: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.DateSheet ||
  mongoose.model("DateSheet", dateSheetSchema);