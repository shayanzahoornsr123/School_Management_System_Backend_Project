const mongoose = require("mongoose");

const chatRoomSchema = new mongoose.Schema(
  {
    schoolName: {
      type: String,
      required: true,
    },

    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    participantsKey: {
      type: String,
    },

    lastMessage: {
      type: String,
      default: "",
    },

    lastMessageAt: {
      type: Date,
    },

    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* ======================================================
   🔥 INDEXES (NO DUPLICATES)
====================================================== */

// Fast lookup for user chats
chatRoomSchema.index({ participants: 1, lastMessageAt: -1 });

// Sorting chats
chatRoomSchema.index({ lastMessageAt: -1 });

// School isolation
chatRoomSchema.index({ schoolName: 1 });

module.exports = mongoose.model("ChatRoom", chatRoomSchema);