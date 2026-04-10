const mongoose = require("mongoose");

const academicRecordSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  schoolName: {
    type: String,
    required: true
  },

  className: {
    type: String,
    required: true
  },

  section: {
    type: String,
    required: true
  },

  rollNumber: {
    type: String,
    required: true
  },

  academicYear: {
    type: String,
    required: true
  },

  status: {
    type: String,
    enum: ["current", "completed"],
    default: "current"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("AcademicRecord", academicRecordSchema);