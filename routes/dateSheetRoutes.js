const express = require('express');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const controller = require('../controllers/dateSheetController');

const router = express.Router();

// Create DateSheet (Teacher only)
router.post(
  '/',
  verifyToken,
  authorizeRoles('teacher'),
  controller.createDateSheet
);

// Get all DateSheets (Admin/Teacher)
router.get(
  '/',
  verifyToken,
  authorizeRoles('admin', 'teacher'),
  controller.getAllDateSheets
);

// Get class DateSheets (Student sees only their class/section)
router.get(
  '/class',
  verifyToken,
  authorizeRoles('student', 'teacher', 'admin', 'parent'),
  controller.getClassDateSheets
);

// Get single DateSheet by ID
router.get(
  '/:id',
  verifyToken,
  authorizeRoles('student', 'teacher', 'admin', 'parent'),
  controller.getDateSheetById
);

// Update DateSheet (Teacher/Admin)
router.put(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  controller.updateDateSheet
);

// Delete DateSheet (Teacher/Admin)
router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  controller.deleteDateSheet
);

module.exports = router;
