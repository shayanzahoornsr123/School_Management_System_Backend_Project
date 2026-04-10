const express = require("express");
const router = express.Router();
const upload = require("../middleware/multer");
const chatController = require("../controllers/chatController");
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");

/* ===========================
   🎤 SEND VOICE MESSAGE
=========================== */
router.post(
  "/voice",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  upload.single("audio"),
  chatController.sendVoiceMessage
);

/* ===========================
   🆕 CREATE OR GET CHAT ROOM
=========================== */
router.post(
  "/chat-room",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  chatController.createOrGetChatRoom
);

/* ===========================
   📃 GET ALL CHAT ROOMS
=========================== */
router.get(
  "/chat-rooms",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  chatController.getUserChatRooms
);

/* ===========================
   💬 MESSAGE HISTORY
=========================== */
router.get(
  "/messages/:chatRoomId",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  chatController.getMessages
);

/* ===========================
   ✉️ SEND TEXT MESSAGE
=========================== */
router.post(
  "/send-message",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  chatController.sendMessage
);

/* ===========================
   🗑️ DELETE MESSAGE (TEXT / VOICE)
=========================== */
/**
 * body: { deleteForEveryone: true | false }
 */
router.delete(
  "/message/:messageId",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  chatController.deleteMessage
);

/* ===========================
   👁️ READ / UNREAD
=========================== */
router.get(
  "/unread/count",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  chatController.getUnreadCount
);

router.put(
  "/mark-read/:chatRoomId",
  verifyToken,
  authorizeRoles("parent", "teacher"),
  chatController.markChatAsRead
);

/* ===========================
   👩‍🏫 / 👨‍👩‍👧 USERS BY ROLE
=========================== */
router.get(
  "/teachers",
  verifyToken,
  authorizeRoles("parent"),
  chatController.getAllTeachers
);

router.get(
  "/parents",
  verifyToken,
  authorizeRoles("teacher"),
  chatController.getAllParents
);

module.exports = router;
