// =============================================
// 📚 Imports
// =============================================
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cloudinary = require("../utils/cloudinary");
const streamifier = require("streamifier");
const sendEmail = require("../utils/email");
const AcademicRecord = require("../models/AcademicRecord");

// =============================================
// 🔐 Generate JWT (7 days expiration)
// =============================================
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, schoolName: user.schoolName },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// =============================================
// 📤 Upload Buffer to Cloudinary Helper
// =============================================
const uploadBufferToCloudinary = (buffer, filename, folder = "profile_images") => {
  return new Promise((resolve, reject) => {
    const publicIdBase = `${folder}/${Date.now()}_${filename.replace(/\s+/g, "_")}`;
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto", public_id: publicIdBase },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};


// =============================================
// 🧾 REGISTER CONTROLLER
// =============================================
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      className,
      section,
      rollNumber,
      schoolName,
      children, // Expected as JSON string from Flutter (for parent)
    } = req.body;

    // -------------------------------
    // 🧩 Basic Validations
    // -------------------------------
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "All required fields must be provided." });

    if (!schoolName)
      return res.status(400).json({ message: "School name is required." });

    // Prevent duplicate email
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered." });

    // -------------------------------
    // 👨‍🏫 Role-specific Validations
    // -------------------------------

    // Student → must include class, section, roll number
    if (role === "student" && (!className || !section || !rollNumber)) {
      return res
        .status(400)
        .json({ message: "Class, Section, and Roll Number are required for students." });
    }

    // Teacher → must have school
    if (role === "teacher" && !schoolName) {
      return res.status(400).json({ message: "School name is required for teachers." });
    }

    // Admin → Only one admin per school
    if (role === "admin") {
      const existingAdmin = await User.findOne({ role: "admin", schoolName });
      if (existingAdmin)
        return res
          .status(400)
          .json({ message: "An admin for this school already exists." });
    }

    // Parent → Must include at least one valid student ID
    let parsedChildren = [];
    if (role === "parent") {
      if (!children) {
        return res
          .status(400)
          .json({ message: "Parent must provide a valid student ID." });
      }

      try {
        parsedChildren = JSON.parse(children);
      } catch (err) {
        return res
          .status(400)
          .json({ message: "Invalid format for student ID." });
      }

      if (!Array.isArray(parsedChildren) || parsedChildren.length === 0) {
        return res
          .status(400)
          .json({ message: "Parent must provide at least one student ID." });
      }

      // Validate each student
      const validStudents = [];
      for (const studentId of parsedChildren) {
        const student = await User.findOne({
          _id: studentId,
          role: "student",
          schoolName,
        });
        if (!student) {
          return res.status(404).json({
            message: `Student with ID ${studentId} not found in this school.`,
          });
        }
        validStudents.push(student._id);
      }
      parsedChildren = validStudents;
    }

    // -------------------------------
    // 🔒 Hash password
    // -------------------------------
    const hashedPassword = await bcrypt.hash(password, 12);

    // -------------------------------
    // 📸 Upload profile image (if any)
    // -------------------------------
    let profileImage = null;
    let profileImagePublicId = null;
    if (req.file && req.file.buffer) {
      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        req.file.originalname
      );
      profileImage = result.secure_url;
      profileImagePublicId = result.public_id;
    }

    // -------------------------------
    // 🔐 Approval Logic
    // -------------------------------
    let isApproved = false;
    let approvedAt = null;

    if (role === "admin") {
      isApproved = true;
      approvedAt = new Date();
    } else if (role === "parent") {
      isApproved = true; // Parent auto-approved after linking
      approvedAt = new Date();
    }

    // -------------------------------
    // 🧍 Create User
    // -------------------------------
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      rollNumber,
      className,
      section,
      schoolName,
      profileImage,
      profileImagePublicId,
      isApproved,
      approvedAt,
      children: parsedChildren,
    });

    // --------------------------------
// 📚 Create Academic Record (Student Only) ✅ NEW
// --------------------------------
if (role === "student") {
  await AcademicRecord.create({
    student: newUser._id,
    schoolName: newUser.schoolName,
    className,
    section,
    rollNumber,
    academicYear: new Date().getFullYear().toString(),
    status: "current",
  });
}

    // -------------------------------
    // 🔑 Generate JWT
    // -------------------------------
    const token = generateToken(newUser);

    // -------------------------------
    // 📤 Send Response
    // -------------------------------
    const message =
      role === "admin"
        ? "Admin account created successfully."
        : role === "parent"
        ? "Parent registered successfully and linked with student(s)."
        : "Account created successfully. Pending admin approval.";

    return res.status(201).json({
      message,
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        schoolName: newUser.schoolName,
        rollNumber: newUser.rollNumber,
        className: newUser.className,
        section: newUser.section,
        profileImage: newUser.profileImage,
        profileImagePublicId: newUser.profileImagePublicId,
        isApproved: newUser.isApproved,
        children: newUser.children,
        approvedAt: newUser.approvedAt,
      },
    });
  } catch (error) {
    console.error("❌ Register Error:", error);
    return res
      .status(500)
      .json({ message: "Server error during registration", error: error.message });
  }
};


// =============================================
// 🔑 LOGIN
// =============================================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ✅ FIXED: include password
    const user = await User.findOne({ email }).select("+password");

    if (!user)
      return res.status(404).json({ message: "Email is Incorrect" });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(400).json({ message: "Password is Incorrect" });

    if (user.role !== "parent" && !user.isApproved)
      return res.status(403).json({ message: "Your account is pending admin approval." });

    const token = generateToken(user);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolName: user.schoolName,
        className: user.className,
        section: user.section,
        rollNumber: user.rollNumber,
        profileImage: user.profileImage,
        isApproved: user.isApproved,
        children: user.children,
      },
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    return res.status(500).json({ message: "Server error during login" });
  }
};


// =============================================
// 🧑‍💼 ADMIN — Approve User (School-specific)
// =============================================
exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin")
      return res.status(403).json({ message: "Only admins can approve users" });

    const user = await User.findOne({ _id: id, schoolName: admin.schoolName });
    if (!user) return res.status(404).json({ message: "User not found in your school" });

    if (user.isApproved) return res.status(400).json({ message: "User already approved" });

    user.isApproved = true;
    await user.save();

    return res.status(200).json({
      message: `${user.role} approved successfully`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
      },
    });
  } catch (error) {
    console.error("❌ Approve User Error:", error);
    return res.status(500).json({ message: "Server error during approval" });
  }
};

// =============================================
// 📋 ADMIN — Get Pending Users (School-specific)
// =============================================
exports.getPendingStudents = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Only admins can fetch users" });
    }

    // Filter only students
    const filter = {
      isApproved: false,
      role: "student",
      schoolName: admin.schoolName,
    };

    const students = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
      users: students,
    });
  } catch (error) {
    console.error("❌ Get Pending Students Error:", error);
    return res.status(500).json({ message: "Server error fetching users" });
  }
};

// =============================================
// 📋 ADMIN — Get Approved Users (School-specific)
// =============================================
exports.getApprovedStudents = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Only admins can fetch users" });
    }

    // Filter only students
    const filter = {
      isApproved: true,
      role: "student",       // <-- only students
      schoolName: admin.schoolName,
    };

    const students = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
      users: students,
    });
  } catch (error) {
    console.error("❌ Get Approved Students Error:", error);
    return res.status(500).json({ message: "Server error fetching users" });
  }
};

// =============================================
// 📋 ADMIN — Get Pending Teachers (School-specific)
// =============================================
exports.getPendingTeachers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Only admins can fetch users" });
    }

    // Filter only teachers
    const filter = {
      isApproved: false,
      role: "teacher", // <-- only teachers
      schoolName: admin.schoolName,
    };

    const teachers = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
      users: teachers,
    });
  } catch (error) {
    console.error("❌ Get Pending Teachers Error:", error);
    return res.status(500).json({ message: "Server error fetching users" });
  }
};

// =============================================
// 📋 ADMIN — Get Approved Teachers (School-specific)
// =============================================
exports.getApprovedTeachers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Only admins can fetch users" });
    }

    // Filter only teachers
    const filter = {
      isApproved: true,
      role: "teacher", // <-- only teachers
      schoolName: admin.schoolName,
    };

    const teachers = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
      users: teachers,
    });
  } catch (error) {
    console.error("❌ Get Approved Teachers Error:", error);
    return res.status(500).json({ message: "Server error fetching users" });
  }
};

// =============================================
// 👤 Get Profile by Role & ID
// =============================================
exports.getProfileByRoleAndId = async (req, res) => {
  try {
    const { role, id } = req.params;

    const user = await User.findOne({ _id: id, role }).select("-password");
    if (!user)
      return res.status(404).json({ message: "User not found" });

    return res.status(200).json(user);
  } catch (error) {
    console.error("❌ Get Profile Error:", error);
    return res.status(500).json({ message: "Server error fetching profile" });
  }
};

// =============================================
// 🖼️ Update Profile Image
// =============================================
exports.updateProfileImage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user)
      return res.status(404).json({ message: "User not found" });

    // Delete previous image
    if (user.profileImagePublicId) {
      await cloudinary.uploader.destroy(user.profileImagePublicId);
    }

    // Upload new image
    if (req.file && req.file.buffer) {
      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        req.file.originalname
      );
      user.profileImage = result.secure_url;
      user.profileImagePublicId = result.public_id;
    }

    await user.save();

    return res.status(200).json({
      message: "Profile image updated successfully",
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error("❌ Update Profile Image Error:", error);
    return res.status(500).json({ message: "Server error updating image" });
  }
};

// =============================================
// ❌ Delete Profile Image
// =============================================
exports.deleteProfileImage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (user.profileImagePublicId) {
      await cloudinary.uploader.destroy(user.profileImagePublicId);
      user.profileImage = null;
      user.profileImagePublicId = null;
      await user.save();
    }

    return res.status(200).json({ message: "Profile image deleted successfully" });
  } catch (error) {
    console.error("❌ Delete Profile Image Error:", error);
    return res.status(500).json({ message: "Server error deleting image" });
  }
};


// =============================================
// ❌ ADMIN — Delete User (Teacher or Student)
// =============================================
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify admin
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Only admins can delete users." });
    }

    // Find user in the same school
    const user = await User.findOne({ _id: id, schoolName: admin.schoolName });
    if (!user) {
      return res.status(404).json({ message: "User not found in your school." });
    }

    // Only allow deleting teacher or student
    if (!["teacher", "student"].includes(user.role)) {
      return res.status(400).json({ message: `Cannot delete a user with role ${user.role}.` });
    }

    // Delete profile image from Cloudinary if exists
    if (user.profileImagePublicId) {
      await cloudinary.uploader.destroy(user.profileImagePublicId);
    }

    // Delete user from database
    await User.deleteOne({ _id: id });

    return res.status(200).json({
      message: `${user.role} deleted successfully.`,
      deletedUserId: id,
    });
  } catch (error) {
    console.error("❌ Delete User Error:", error);
    return res.status(500).json({ message: "Server error deleting user", error: error.message });
  }
};

// =============================================
// 🔐 FORGOT PASSWORD — Send OTP
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.resetOTP = otp;
    user.resetOTPExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    // Send OTP email
    await sendEmail({
      to: email,
      subject: "Password Reset OTP",
      text: `Your password reset OTP is ${otp}. It is valid for 10 minutes.`,
      html: `<p>Your password reset OTP is <b>${otp}</b>. It is valid for 10 minutes.</p>`
    });

    return res.status(200).json({
      message: "OTP sent to your email",
    });
  } catch (error) {
    console.error("❌ Forgot Password Error:", error);
    return res.status(500).json({ message: "Server error sending OTP" });
  }
};


// =============================================
// 🔎 VERIFY OTP
// =============================================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP are required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found" });

    if (user.resetOTP !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    if (user.resetOTPExpiry < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    return res.status(200).json({
      message: "OTP verified successfully",
    });
  } catch (error) {
    console.error("❌ OTP Verification Error:", error);
    return res.status(500).json({ message: "Server error verifying OTP" });
  }
};
 

// =============================================
// 🔄 RESET PASSWORD
// =============================================
exports.resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword)
      return res.status(400).json({ message: "Email and new password required" });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;
    user.resetOTP = null;
    user.resetOTPExpiry = null;

    await user.save();

    return res.status(200).json({
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("❌ Reset Password Error:", error);
    return res.status(500).json({ message: "Server error resetting password" });
  }
};


// =============================================
// 🎓 ADMIN — Promote Student
// =============================================
exports.promoteStudent = async (req, res) => {
  try {
    const { studentId, className, section, rollNumber, academicYear } = req.body;

    // -------------------------------
    // 🧩 Validation
    // -------------------------------
    if (!studentId || !className || !section || !rollNumber || !academicYear) {
      return res.status(400).json({
        message: "All fields are required for promotion",
      });
    }

    // -------------------------------
    // 🔐 Check Admin
    // -------------------------------
    const admin = await User.findById(req.user.id);
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Only admin can promote students" });
    }

    // -------------------------------
    // 🎓 Check Student (Same School)
    // -------------------------------
    const student = await User.findOne({
      _id: studentId,
      role: "student",
      schoolName: admin.schoolName,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found in your school",
      });
    }

    // -------------------------------
    // 🧾 Mark old record as completed
    // -------------------------------
    const existingCurrent = await AcademicRecord.findOne({
      student: studentId,
      status: "current",
    });

    if (existingCurrent) {
      existingCurrent.status = "completed";
      await existingCurrent.save();
    }

    // -------------------------------
    // 🆕 Create new academic record
    // -------------------------------
    const newRecord = await AcademicRecord.create({
      student: studentId,
      schoolName: admin.schoolName,
      className,
      section,
      rollNumber,
      academicYear,
      status: "current",
    });

    // -------------------------------
    // 🔄 Update User (optional but useful)
    // -------------------------------
    student.className = className;
    student.section = section;
    student.rollNumber = rollNumber;
    await student.save();

    return res.status(200).json({
      message: "Student promoted successfully",
      newRecord,
    });

  } catch (error) {
    console.error("❌ Promote Student Error:", error);
    return res.status(500).json({
      message: "Server error promoting student",
    });
  }
};


// =============================================
// 🎓 STUDENT — Get My Records
// =============================================
exports.getMyAcademicRecords = async (req, res) => {
  try {
    const records = await AcademicRecord.find({
      student: req.user.id,
    })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json(records);

  } catch (error) {
    console.error("❌ Get My Records Error:", error);
    return res.status(500).json({
      message: "Error fetching records",
    });
  }
};


// =============================================
// 👨‍🏫 ADMIN / TEACHER — Get Student Records
// =============================================
exports.getStudentAcademicRecords = async (req, res) => {
  try {
    const { studentId } = req.params;

    const user = await User.findById(req.user.id);

    if (!["admin", "teacher"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // ✅ Ensure same school
    const student = await User.findOne({
      _id: studentId,
      role: "student",
      schoolName: user.schoolName,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found in your school",
      });
    }

    const records = await AcademicRecord.find({
      student: studentId,
    })
      .populate("student", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json(records);

  } catch (error) {
    console.error("❌ Get Student Records Error:", error);
    return res.status(500).json({
      message: "Error fetching records",
    });
  }
};


// =============================================
// 👨‍👩‍👧 PARENT — Get Children Records
// =============================================
exports.getChildrenAcademicRecords = async (req, res) => {
  try {
    const parent = await User.findById(req.user.id);

    if (!parent || parent.role !== "parent") {
      return res.status(403).json({ message: "Access denied" });
    }

    const records = await AcademicRecord.find({
      student: { $in: parent.children },
      schoolName: parent.schoolName,
    })
      .populate("student", "name className section rollNumber")
      .sort({ createdAt: -1 });

    return res.status(200).json(records);

  } catch (error) {
    console.error("❌ Get Children Records Error:", error);
    return res.status(500).json({
      message: "Error fetching records",
    });
  }
};