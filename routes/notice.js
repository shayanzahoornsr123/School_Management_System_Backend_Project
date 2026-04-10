const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * 🧠 NOTICE ROUTES
 * Organized and grouped by access type
 */

/* ===========================
   📚 STUDENT ROUTES (Read/Unread)
=========================== */

// 📬 Unread count badge
router.get(
  '/unread/count',
  verifyToken,
  authorizeRoles('student', 'parent', 'teacher'),
  noticeController.getUnreadCount
);

// 📩 Fetch all unread notices
router.get(
  '/unread',
  verifyToken,
  authorizeRoles('student', 'parent', 'teacher'),
  noticeController.getUnreadNotices
);

// 📖 Fetch all read notices
router.get(
  '/read',
  verifyToken,
  authorizeRoles('student', 'parent', 'teacher'),
  noticeController.getReadNotices
);

// ✅ Mark all notices as read
router.put(
  '/mark-all-read',
  verifyToken,
  authorizeRoles('student', 'parent', 'teacher'),
  noticeController.markAllNoticesAsRead
);

// ✅ Mark a specific notice as read
router.put(
  '/:id/mark-read',
  verifyToken,
  authorizeRoles('student', 'parent', 'teacher'),
  noticeController.markNoticeAsRead
);

/* ===========================
   🧑‍🏫 TEACHER / ADMIN ROUTES
=========================== */

// 🆕 Create a new notice
router.post(
  '/',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  noticeController.createNotice
);

// ✏️ Update a notice
router.put(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  noticeController.updateNotice
);

// 🗑️ Delete a notice
router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  noticeController.deleteNotice
);

/* ===========================
   🌐 COMMON ROUTES (All Roles)
=========================== */

// 📢 Fetch all notices (filtered by role)
router.get('/', verifyToken, noticeController.getNotices);

// 📝 Fetch single notice by ID
router.get('/:id', verifyToken, noticeController.getNoticeById);

module.exports = router;
