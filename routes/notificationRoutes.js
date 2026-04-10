const express = require("express");
const router = express.Router();

const {
  sendNotificationToClass,
  sendNotificationToStudent, // 🔥 NEW
  registerToken,
  getNotificationsByUser,
  markNotificationAsRead,
  getUnreadCount,
} = require("../controllers/notificationControllers");

const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");

// ======================================
// 🔐 Protect All Notification Routes
// ======================================

// ✅ Teachers & Admins → Send to Class
router.post(
  "/send/class",
  verifyToken,
  authorizeRoles("teacher", "admin"),
  sendNotificationToClass
);

// 🔥 NEW → Send to Single Student (+ Parent auto)
router.post(
  "/send/student",
  verifyToken,
  authorizeRoles("teacher", "admin"),
  sendNotificationToStudent
);

// ✅ Register FCM Token
router.post("/register-token", verifyToken, registerToken);

// ✅ Get Notifications (target-based now)
router.get("/", verifyToken, getNotificationsByUser);

// ✅ Mark as Read
router.patch("/:notificationId/read", verifyToken, markNotificationAsRead);

// ✅ Unread Count
router.get("/unread/count", verifyToken, getUnreadCount);

module.exports = router;