const express = require("express");
const router = express.Router();
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const {
  register,
  login,
  getProfileByRoleAndId,
  getPendingStudents,
  approveUser,
  getApprovedStudents,
  getPendingTeachers,
  getApprovedTeachers,
  deleteUser,
  updateProfileImage,
  deleteProfileImage,
  forgotPassword,
  verifyOTP,
  resetPassword,
  promoteStudent,
  getMyAcademicRecords,
  getStudentAcademicRecords,
  getChildrenAcademicRecords,
} = require("../controllers/authController");


const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");

// =============================================
// 🧱 MULTER SETUP (Cloudinary Memory Storage)
// =============================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// =============================================
// 🛡️ RATE LIMITERS (Security)
// =============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 register/login requests per window
  message: { message: "Too many attempts. Please try again later." },
});

// =============================================
// 🔓 PUBLIC ROUTES
// =============================================

// Register new user (supports image upload)
router.post("/register", authLimiter, upload.single("profileImage"), register);

// Login
router.post("/login", authLimiter, login);

// =============================================
// 🔐 PROTECTED ROUTES (Requires Token)
// =============================================

// Get profile by role + id
// Example: /api/auth/profile/student/65231abc123def
router.get("/profile/:role/:id", verifyToken, getProfileByRoleAndId);

// Update profile image
router.put(
  "/users/profile/image",
  verifyToken,
  upload.single("profileImage"),
  updateProfileImage
);

// Delete profile image
router.delete("/users/profile/image", verifyToken, deleteProfileImage);

// =============================================
// 🧑‍💼 ADMIN-ONLY ROUTES
// =============================================

// Get all pending users
router.get("/pending", verifyToken, authorizeRoles("admin", "teacher"), getPendingStudents);

// Get all approved users
router.get("/approved", verifyToken, authorizeRoles("admin", "teacher"), getApprovedStudents);

// Get all pending teachers
router.get(
  "/pending-teacher",
  verifyToken,
  authorizeRoles("admin", "teacher"),
  getPendingTeachers
);

// Get all approved teachers
router.get(
  "/approved-teacher",
  verifyToken,
  authorizeRoles("admin", "teacher"),
  getApprovedTeachers
);

// Approve a specific user
router.put("/approve/:id", verifyToken, authorizeRoles("admin", "teacher"), approveUser);

// ❌ Delete a teacher or student by ID (admin only)
router.delete("/users/:id", verifyToken, authorizeRoles("admin", "teacher"), deleteUser);

// =============================================
// 🔐 FORGOT PASSWORD ROUTES
// =============================================

// 1. Send OTP
router.post("/forgot-password", forgotPassword);

// 2. Verify OTP
router.post("/verify-otp", verifyOTP);

// 3. Reset Password
router.post("/reset-password", resetPassword);


// =============================================
// 🎓 ACADEMIC ROUTES
// =============================================

// 🧑‍💼 ADMIN — Promote Student
router.post(
  "/academic/promote",
  verifyToken,
  authorizeRoles("admin"),
  promoteStudent
);

// 🎓 STUDENT — Get My Academic Records
router.get(
  "/academic/my-records",
  verifyToken,
  authorizeRoles("student"),
  getMyAcademicRecords
);

// 👨‍🏫 ADMIN / TEACHER — Get Student Records
router.get(
  "/academic/student/:studentId",
  verifyToken,
  authorizeRoles("admin", "teacher"),
  getStudentAcademicRecords
);

// 👨‍👩‍👧 PARENT — Get Children Records
router.get(
  "/academic/children",
  verifyToken,
  authorizeRoles("parent"),
  getChildrenAcademicRecords
);


// =============================================
// ⚙️ EXPORT ROUTER
// =============================================
module.exports = router;
