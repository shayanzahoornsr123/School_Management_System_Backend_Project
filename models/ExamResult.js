const mongoose = require("mongoose");


const examResultSchema = new mongoose.Schema({
  studentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },

  studentName: { type: String, trim: true },
  rollNumber: { type: String, trim: true },

  examType: { 
    type: String, 
    required: true,
    index: true 
  },

  class: { 
    type: String, 
    required: true, 
    index: true 
  },

  section: { 
    type: String, 
    required: true, 
    index: true 
  },

  schoolName: {
    type: String,
    required: true,
    index: true,
  },

  subjects: [
    {
      name: { type: String, required: true },
      marksObtained: { type: Number, required: true, min: 0 },
      totalMarks: { type: Number, required: true, min: 1 }
    }
  ],

  totalObtained: { type: Number, default: 0 },
  totalMarks: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  grade: { type: String, default: 'F', index: true },

  isRead: { type: Boolean, default: false, index: true },

}, { timestamps: true });

/* INDEXES */

// Student dashboard
examResultSchema.index({ studentId: 1, createdAt: -1 });

// Unread
examResultSchema.index({ studentId: 1, isRead: 1 });

// Class view
examResultSchema.index({
  schoolName: 1,
  class: 1,
  section: 1,
  createdAt: -1
});

// Admin filtering
examResultSchema.index({
  schoolName: 1,
  examType: 1,
  createdAt: -1
});

module.exports = mongoose.model('ExamResult', examResultSchema);