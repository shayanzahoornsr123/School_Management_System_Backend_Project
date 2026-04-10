// routes/assignmentRoutes.js
const express = require('express');
const controller = require('../controllers/assignmentController');
const upload = require('../middleware/upload'); // Multer + Cloudinary
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// =======================
// Public Read Routes (Students/Parents/Admin/Teacher)
// =======================
// List assignments with filters, search, pagination
router.get(
  '/',
  verifyToken,
  authorizeRoles('student','parent','admin','teacher'),
  controller.getAssignments
);

// Get single assignment by ID
router.get(
  '/:id',
  verifyToken,
  authorizeRoles('admin','teacher','student','parent'),
  controller.getAssignmentById
);

// =======================
// Teacher/Admin Routes (Create/Update/Delete)
// =======================

// Create assignment with optional file upload
router.post(
  '/',
  verifyToken,
  authorizeRoles('teacher','admin'),
  upload.single('file'),
  controller.createAssignment
);

// Update assignment (optional new file upload)
router.put(
  '/:id',
  verifyToken,
  authorizeRoles('teacher','admin'),
  upload.single('file'),
  controller.updateAssignment
);

// Delete assignment
router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('teacher','admin'),
  controller.deleteAssignment
);

module.exports = router;
