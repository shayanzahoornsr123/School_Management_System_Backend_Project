// routes/studyMaterialRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  verifyToken,
  authorizeRoles,
} = require('../middleware/authMiddleware');
const studyMaterialController = require('../controllers/studyMaterialController');

// ======================= Multer Config ======================= //
// Using memory storage so we can upload to Cloudinary or another service easily
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 600 * 1024 * 1024, // 600 MB max file size
  },
});

// ======================= ROUTES ======================= //

/**
 * 📤 Upload new study material
 * - Accessible by teacher/admin
 * - Accepts optional file upload (images, PDFs, videos, etc.)
 * - Can also include a YouTube or external link
 */
router.post(
  '/upload',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  upload.single('file'),
  studyMaterialController.createStudyMaterial
);

/**
 * 📋 Get all materials (for teachers/admin to review or manage)
 */
router.get(
  '/',
  verifyToken,
  authorizeRoles('teacher', 'admin', 'parent', 'student'),
  studyMaterialController.getAllMaterials
);

/**
 * 🎓 Get study materials for a specific class and section
 * - Accessible by student/teacher/admin
 * - Teachers can see materials by class
 * - Students can view their own class materials
 */
router.get(
  '/class/:className/section/:section',
  verifyToken,
  authorizeRoles('student', 'parent', 'teacher', 'admin'),
  studyMaterialController.getMaterialsByClass
);

/**
 * 🔍 Get a single study material by ID
 */
router.get('/:id', verifyToken, studyMaterialController.getMaterialById);

/**
 * ✏️ Update a study material
 * - Teachers/admin can update title, description, file, or link
 */
router.put(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  upload.single('file'),
  studyMaterialController.updateMaterial
);

/**
 * ❌ Delete a study material
 * - Teachers/admin can delete their uploads
 */
router.delete(
  '/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  studyMaterialController.deleteMaterial
);

/**
 * ✅ Mark material as completed (for students)
 */
router.put(
  '/:id/complete',
  verifyToken,
  authorizeRoles('student', 'parent'),
  studyMaterialController.markComplete
);

/**
 * 🔄 Mark material as incomplete (for students)
 */
router.put(
  '/:id/incomplete',
  verifyToken,
  authorizeRoles('student', 'parent'),
  studyMaterialController.markIncomplete
);

module.exports = router;
