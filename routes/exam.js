// routes/examResultRoutes.js
const express = require("express");
const router = express.Router();

const {
  createExamResults,
  getExamResultsByStudent,
  getAllExamResults,
  getStudentUnreadCount,
  markAllExamResultsReadForStudent,
  markExamResultAsRead,
  updateExamResult,
  deleteExamResult,
} = require("../controllers/examResultController");

const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");

/**
 * =========================================
 * ➕ 1. Create Exam Result (teacher/admin only)
 * =========================================
 */
router.post(
  "/add",
  verifyToken,
  authorizeRoles("teacher", "admin"),
  createExamResults
);

/**
 * =========================================
 * 📥 2a. Get Exam Results for logged-in student (student/parent dashboard)
 * =========================================
 */
router.get(
  "/student",
  verifyToken,
  authorizeRoles("student", "parent", "teacher"),
  getExamResultsByStudent
);

/**
 * =========================================
 * 📥 2b. Get Exam Results for a specific student (student/parent)
 * =========================================
 */
router.get(
  "/student/:id",
  verifyToken,
  authorizeRoles("student", "parent", "teacher"),
  getExamResultsByStudent
);

/**
 * =========================================
 * 📊 3. Get All Exam Results (teacher/admin only)
 * =========================================
 */
router.get(
  "/all",
  verifyToken,
  authorizeRoles("teacher", "admin", "student"),
  getAllExamResults
);

/**
 * =========================================
 * 🔔 4. Get Student Unread ExamResult Count (student/parent only)
 * =========================================
 */
router.get(
  "/student/unread/count",
  verifyToken,
  authorizeRoles("student", "parent", "teacher"),
  getStudentUnreadCount
);

/**
 * =========================================
 * ✅ 5. Mark All Exam Results as Read (student/parent only)
 * =========================================
 */
router.patch(
  "/student/mark-all-read",
  verifyToken,
  authorizeRoles("student", "parent"),
  markAllExamResultsReadForStudent
);

/**
 * =========================================
 * ✅ 6. Mark Single Exam Result as Read (student/parent only)
 * =========================================
 */
router.patch(
  "/:id/read",
  verifyToken,
  authorizeRoles("student", "parent"),
  markExamResultAsRead
);

/**
 * =========================================
 * 🔁 7. Update Exam Result (teacher/admin only)
 * =========================================
 */
router.put(
  "/:id",
  verifyToken,
  authorizeRoles("teacher", "admin"),
  updateExamResult
);

/**
 * =========================================
 * 🗑️ 8. Delete Exam Result (teacher/admin only)
 * =========================================
 */
router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("teacher", "admin"),
  deleteExamResult
);

module.exports = router;