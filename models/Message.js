// const mongoose = require("mongoose");

// const messageSchema = new mongoose.Schema({
//   chatRoom: { type: mongoose.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
//   sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//   text: { type: String },
//   attachments: [{ type: String }], // Cloudinary URLs if needed
//   isRead: { type: Boolean, default: false },
//   createdAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model("Message", messageSchema);


const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    chatRoom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatRoom",
      required: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    messageType: {
      type: String,
      enum: ["text", "audio"],
      default: "text",
    },

    text: {
      type: String,
      trim: true,
    },

    audioUrl: {
      type: String,
      trim: true,
    },

    audioDuration: {
      type: Number,
      min: 0,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    isDeletedForEveryone: {
      type: Boolean,
      default: false,
    },

    attachments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* ======================================================
   🔥 OPTIMIZED INDEXES (NO DUPLICATES)
====================================================== */

// 🚀 Load chat messages (PRIMARY QUERY)
messageSchema.index({ chatRoom: 1, createdAt: 1 });

// 🚀 Unread count (badge)
messageSchema.index({ receiver: 1, isRead: 1 });

// 🚀 Sender history (optional but useful)
messageSchema.index({ sender: 1, createdAt: -1 });

// 🚀 Soft delete filtering
messageSchema.index({ isDeletedForEveryone: 1 });

// 🚀 Delete-for-me support
messageSchema.index({ deletedFor: 1 });

module.exports = mongoose.model("Message", messageSchema);
