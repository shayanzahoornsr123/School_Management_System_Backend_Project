// routes/attendanceRoutes.js
const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * ===============================
 * Attendance Routes
 * ===============================
 */

// 📌 Mark attendance
// - Student: self-mark
// - Teacher/Admin: mark for whole class/section
router.post(
  '/',
  verifyToken,
  attendanceController.markAttendance
);

// 📌 Get all attendance by class/section (Teacher/Admin only)
router.get(
  '/',
  verifyToken,
  authorizeRoles('teacher'),
  attendanceController.getAllAttendance
);

// 📌 Get attendance of a student
// - Student: sees own
// - Teacher/Admin: pass :id to view specific student
router.get(
  '/student/:id',
  verifyToken,
  attendanceController.getAttendanceByStudent
);

// 📌 Get unread count for student
router.get(
  '/student/:id/unread-count',
  verifyToken,
  attendanceController.getUnreadCount
);

// 📌 Mark all as read for student
router.put(
  '/student/:id/read-all',
  verifyToken,
  attendanceController.markAllReadForStudent
);

// 📌 Update attendance record (Teacher/Admin only)
router.put(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  attendanceController.updateAttendance
);

// 📌 Delete attendance record (Teacher/Admin only)
router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  attendanceController.deleteAttendance
);

module.exports = router;
