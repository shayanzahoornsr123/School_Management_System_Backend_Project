const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  schoolName: { 
    type: String, 
    required: true,
    index: true // ✅ CRITICAL (multi-tenant isolation)
  },

  className: { 
    type: String, 
    required: true, 
    trim: true,
    index: true 
  },

  section: { 
    type: String, 
    required: true, 
    trim: true,
    index: true 
  },

  day: { 
    type: String, 
    required: true, 
    enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    index: true
  },

  subject: { 
    type: String, 
    required: true, 
    trim: true 
  },

  teacherName: { 
    type: String, 
    required: true, 
    trim: true 
  },

  startTime: { 
    type: String, 
    required: true,
    index: true // ✅ helps sorting
  },

  endTime: { 
    type: String, 
    required: true 
  },

  attachmentUrl: { type: String },
  attachmentPublicId: { type: String },

  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true // ✅ useful for future analytics
  },

}, { 
  timestamps: true 
});

//
// 🚀 SCALABLE INDEXES (VERY IMPORTANT)
//

// 🔥 MAIN QUERY (MOST USED)
timetableSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
  day: 1,
  startTime: 1
});

// 🔥 FILTER WITHOUT DAY (for full timetable)
timetableSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
  startTime: 1
});

// 🔥 SCHOOL LEVEL FETCH (admin view)
timetableSchema.index({
  schoolName: 1,
  day: 1,
  startTime: 1
});

// 🔥 CREATED BY (future dashboard / analytics)
timetableSchema.index({
  createdBy: 1,
  createdAt: -1
});

module.exports = mongoose.model('TimeTable', timetableSchema);