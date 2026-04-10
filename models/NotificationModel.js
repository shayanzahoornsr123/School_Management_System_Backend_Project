const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: { 
      type: String, 
      required: true,
      trim: true 
    },

    body: { 
      type: String, 
      required: true,
      trim: true 
    },

    // 🔹 Sender
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      index: true
    },

    // 🔹 Class info
    className: { 
      type: String,
      index: true
    },

    section: { 
      type: String,
      index: true
    },

    schoolName: { 
      type: String, 
      required: true,
      index: true
    },

    // 🔥 Target users
    targetUsers: [
      { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User" 
      }
    ],

    // 🔥 Type
    type: {
      type: String,
      enum: ["class", "individual"],
      default: "class",
      index: true
    },

    // ✅ Read tracking
    readBy: [
      { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User" 
      }
    ],
  },
  {
    timestamps: true,   // ✅ replaces createdAt
    versionKey: false,
  }
);

//
// 🚀 INDEXES (CRITICAL FOR SCALABILITY)
//

// 🔥 User notifications (main query)
notificationSchema.index({
  targetUsers: 1,
  createdAt: -1,
});

// 🔥 Unread count optimization
notificationSchema.index({
  targetUsers: 1,
  readBy: 1,
});

// 🔥 School + time filtering (multi-tenant)
notificationSchema.index({
  schoolName: 1,
  createdAt: -1,
});

// 🔥 Class-level targeting
notificationSchema.index({
  schoolName: 1,
  className: 1,
  section: 1,
});

// 🔥 Sender analytics (future safe)
notificationSchema.index({
  userId: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Notification", notificationSchema);