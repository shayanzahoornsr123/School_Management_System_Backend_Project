const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// 📚 Import Controller
const {
  createBook,
  getBooks,
  updateBook,
  deleteBook
} = require('../controllers/libraryController');

// 🛡️ Import Middlewares
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * ==========================
 * 📘 BOOKS ROUTES
 * ==========================
 */

// ➕ Create new book (Admin/Teacher)
router.post(
  '/books',
  verifyToken,
  authorizeRoles('admin', 'teacher'),
  upload.single('cover'),
  createBook
);

// 📄 Get all books (students/teachers/parents)
router.get(
  '/books',
  verifyToken,
  authorizeRoles('student', 'teacher', 'parent'),
  getBooks
);

// ✏️ Update book (Admin/Teacher)
router.put(
  '/books/:id',
  verifyToken,
  authorizeRoles('admin', 'teacher'),
  upload.single('cover'),
  updateBook
);

// ❌ Delete book (Admin/Teacher)
router.delete(
  '/books/:id',
  verifyToken,
  authorizeRoles('teacher', 'admin'),
  deleteBook
);

module.exports = router;