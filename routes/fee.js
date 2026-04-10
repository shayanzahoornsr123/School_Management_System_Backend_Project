const express = require('express');
const router = express.Router();
const multer = require('multer');

const { verifyToken } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  assignFee,
  getFeesByClass,
  getFeesByStudent,
  payFee,
  getUnreadFees,
  markFeeAsRead,
  getReadFees,
  deleteFee
} = require('../controllers/feeController');

// ================= Multer Setup =================
// store file in memory to pipe to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ================= Routes =================

// Assign Fee → Admin & Teacher
router.post(
  '/assign',
  verifyToken,
  authorizeRoles('admin', 'teacher'),
  assignFee
);

// Get Fees by Class/Section → Admin, Teacher can query, Student restricted
router.get(
  '/class',
  verifyToken,
  authorizeRoles('admin', 'teacher', 'student', 'parent'),
  getFeesByClass
);

// Get Fees by Student ID → Admin & Teacher, or the student himself
router.get(
  '/student/:id',
  verifyToken,
  authorizeRoles('admin', 'teacher', 'student', 'parent'),
  getFeesByStudent
);

// 🔔 Unread/Read APIs for Student
router.get('/unread', verifyToken, authorizeRoles('student', 'parent'), getUnreadFees);
router.get('/read', verifyToken, authorizeRoles('student', 'parent'), getReadFees);
router.put('/:id/mark-read', verifyToken, authorizeRoles('student', 'parent'), markFeeAsRead);

// Pay Fee with proof → Only Student
router.put(
  '/:id/pay',
  verifyToken,
  authorizeRoles('student', 'parent'),
  upload.single('proofImage'),
  payFee
);

// Delete Fee → Admin & Teacher
router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('admin', 'teacher'),
  deleteFee
);

module.exports = router;
