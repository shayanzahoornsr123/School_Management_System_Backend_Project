const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    // 📢 Notice core info
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      index: true // 🔥 fast search/filter
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    // 🎓 Targeting
    className: {
      type: String,
      trim: true,
      default: "",
      index: true // 🔥 filter optimization
    },

    section: {
      type: String,
      trim: true,
      default: "",
      index: true
    },

    schoolName: {
      type: String,
      required: true,
      trim: true,
      index: true // 🔥 MUST for all queries
    },

    // 👤 Creator
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // 🧑‍🎓 Read tracking (kept as requested)
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true // ⚠ helps but still heavy
      }
    ],

    // 🔔 Global read state
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },

    // 📌 UI flags
    isPinned: {
      type: Boolean,
      default: false,
      index: true
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
  },
  { timestamps: true }
);

//
// 🚀 COMPOUND INDEXES (VERY IMPORTANT)
//

// 🔥 MAIN QUERY INDEX (MOST USED)
noticeSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
  isActive: 1,
  createdAt: -1
});

// 🔥 SORT OPTIMIZATION
noticeSchema.index({
  schoolName: 1,
  isPinned: -1,
  createdAt: -1
});

// 🔥 READ FILTER OPTIMIZATION (partial help)
noticeSchema.index({
  schoolName: 1,
  readBy: 1
});

// 🔥 TEXT SEARCH
noticeSchema.index({
  title: "text",
  description: "text"
});

//
// 🔍 STATIC HELPERS (OPTIMIZED)
//

// Active notices
noticeSchema.statics.findActive = function (filters = {}, options = {}) {
  const { limit = 20, skip = 0 } = options;

  return this.find({
    ...filters,
    isActive: true
  })
    .sort({ isPinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // 🔥 important
};

// Unread for student (optimized)
noticeSchema.statics.findUnreadForStudent = function (studentId, filters = {}, options = {}) {
  const { limit = 20, skip = 0 } = options;

  return this.find({
    ...filters,
    isActive: true,
    readBy: { $ne: studentId }
  })
    .sort({ isPinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Read notices
noticeSchema.statics.findReadForStudent = function (studentId, filters = {}, options = {}) {
  const { limit = 20, skip = 0 } = options;

  return this.find({
    ...filters,
    readBy: studentId
  })
    .sort({ isPinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
};

// Count unread (optimized)
noticeSchema.statics.countUnreadForStudent = function (studentId, filters = {}) {
  return this.countDocuments({
    ...filters,
    isActive: true,
    readBy: { $ne: studentId }
  });
};

module.exports = mongoose.model("Notice", noticeSchema);