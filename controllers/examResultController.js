const mongoose = require("mongoose");
const ExamResult = require("../models/ExamResult");
const User = require("../models/User");

// ⚡ Socket.IO instance
let io;
exports.setSocketIO = (socketInstance) => {
  io = socketInstance;
};

//
// ✅ 1. Create Exam Result (teacher/admin only)
//
exports.createExamResults = async (req, res) => {
  try {
    const payloadList = req.body;

    if (!Array.isArray(payloadList) || payloadList.length === 0) {
      return res.status(400).json({ message: "Exam results list is required" });
    }

    if (!["teacher", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only teachers or admins can create exam results." });
    }

    // 🔥 Get all studentIds
    const studentIds = payloadList.map(p => p.studentId);

    // 🔥 Fetch all students in ONE query
    const students = await User.find({
      _id: { $in: studentIds },
      schoolName: req.user.schoolName,
    })
      .select("_id className section schoolName")
      .lean();

    const studentMap = {};
    students.forEach(s => {
      studentMap[String(s._id)] = s;
    });

    const toInsert = [];

    for (const payload of payloadList) {
      const { studentId, examType, subjects } = payload;

      if (!studentId) return res.status(400).json({ message: "studentId is required" });
      if (!examType || !subjects?.length) return res.status(400).json({ message: "examType and subjects are required" });

      const student = studentMap[String(studentId)];
      if (!student) return res.status(404).json({ message: `Student not found: ${studentId}` });

      const totalObtained = subjects.reduce((sum, s) => sum + s.marksObtained, 0);
      const totalMarks = subjects.reduce((sum, s) => sum + s.totalMarks, 0);
      const percentage = ((totalObtained / totalMarks) * 100).toFixed(2);

      let grade = "F";
      if (percentage >= 90) grade = "A+";
      else if (percentage >= 80) grade = "A";
      else if (percentage >= 70) grade = "B";
      else if (percentage >= 60) grade = "C";
      else if (percentage >= 50) grade = "D";

      toInsert.push({
        studentId,
        examType,
        class: student.className,
        section: student.section,
        subjects,
        totalObtained,
        totalMarks,
        percentage,
        grade,
        isRead: false,
        schoolName: student.schoolName,
      });
    }

    // 🔥 BULK INSERT (fast)
    const savedResults = await ExamResult.insertMany(toInsert);

    // 🔥 Socket emit (same behavior)
    savedResults.forEach(result => {
      io?.to(String(result.studentId)).emit("exam_result_update", {
        message: "New exam result published",
        examResult: result,
      });
    });

    return res.status(201).json({
      message: "Exam results created successfully",
      examResults: savedResults,
    });

  } catch (err) {
    console.error("createExamResults:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};

//
// ✅ 2. Get Exam Results by Student
//
exports.getExamResultsByStudent = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("_id role schoolName children")
      .populate("children", "_id")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    let studentIds = [];

    if (user.role === "student") {
      studentIds = [user._id];
    } else if (user.role === "parent") {
      if (!user.children?.length) {
        return res.status(200).json({ total: 0, page: 1, records: [] });
      }
      studentIds = user.children.map(c => c._id);
    } else if (["teacher", "admin"].includes(user.role)) {
      const studentId = req.params.id || req.query.studentId;

      if (!studentId) return res.status(200).json({ total: 0, page: 1, records: [] });
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ message: "Invalid studentId" });
      }

      const student = await User.findById(studentId)
        .select("schoolName")
        .lean();

      if (!student) return res.status(404).json({ message: "Student not found" });
      if (student.schoolName !== user.schoolName) {
        return res.status(403).json({ message: "Access denied" });
      }

      studentIds = [studentId];
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 15, 100);
    const skip = (page - 1) * limit;

    const filter = { studentId: { $in: studentIds } };
    if (req.query.unreadOnly === "true") filter.isRead = false;

    const [results, total] = await Promise.all([
      ExamResult.find(filter)
        .select("studentId examType subjects totalObtained totalMarks percentage grade isRead createdAt")
        .populate("studentId", "name rollNumber className section")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      ExamResult.countDocuments(filter),
    ]);

    return res.status(200).json({
      total,
      page,
      pages: Math.ceil(total / limit),
      records: results,
    });

  } catch (err) {
    console.error("getExamResultsByStudent:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};


/**
 * ===============================
 * GET ALL EXAM RESULTS (Paginated by Students)
 * ===============================
 */
exports.getAllExamResults = async (req, res) => {
  try {
    let { className, section, page = 1, limit = 60 } = req.query;

    if (!className || !section) {
      return res.status(400).json({
        message: "className and section are required",
      });
    }

    // 🔹 Safe parsing
    page = Math.max(parseInt(page) || 1, 1);
    limit = Math.min(parseInt(limit) || 60, 60);
    const skip = (page - 1) * limit;

    const schoolName = req.user.schoolName;

    // 🔹 Total students count
    const totalStudents = await User.countDocuments({
      role: "student",
      className,
      section,
      schoolName,
    });

    console.log("========== DEBUG: TOTAL STUDENTS ==========");
    console.log("Class:", className, "Section:", section);
    console.log("Total students in class-section:", totalStudents);

    // 🔹 Fetch paginated students
    const students = await User.find({
      role: "student",
      className,
      section,
      schoolName,
    })
      .select("_id name email rollNumber className section")
      .sort({ rollNumber: 1 }) // stable sort
      .skip(skip)
      .limit(limit)
      .lean();

    console.log("========== DEBUG: STUDENTS FETCHED ==========");
    console.log("Page:", page);
    console.log("Limit:", limit);
    console.log("Students fetched:", students.length);
    students.forEach((s) => console.log("Student ID:", s._id, "Name:", s.name));

    if (students.length === 0) {
      return res.json({
        total: totalStudents,
        page,
        limit,
        totalPages: Math.ceil(totalStudents / limit),
        hasMore: false,
        students: [],
      });
    }

    const studentIds = students.map((s) => s._id);

    // 🔹 Fetch all exam results for the batch
    const examResults = await ExamResult.find({
      studentId: { $in: studentIds },
      schoolName,
    })
      .select(
        "studentId examType subjects totalObtained totalMarks percentage grade isRead createdAt"
      )
      .sort({ createdAt: -1 }) // latest first
      .lean();

    console.log("========== DEBUG: EXAM RESULTS FETCHED ==========");
    console.log("Total exam results fetched:", examResults.length);
    examResults.forEach((r) =>
      console.log(
        "Student ID:",
        r.studentId,
        "ExamType:",
        r.examType,
        "CreatedAt:",
        r.createdAt
      )
    );

    // 🔹 Map exam results by studentId
    const examMap = studentIds.reduce((acc, sid) => {
      acc[String(sid)] = [];
      return acc;
    }, {});

    for (const result of examResults) {
      const sid = String(result.studentId);
      if (!examMap[sid]) examMap[sid] = [];
      examMap[sid].push(result);
    }

    // 🔹 Merge results into students
    const studentsWithResults = students.map((student) => ({
      ...student,
      examResults: examMap[String(student._id)] || [],
    }));

    console.log("========== DEBUG: STUDENTS WITH RESULTS ==========");
    studentsWithResults.forEach((s) => {
      console.log(
        "Student ID:",
        s._id,
        "Name:",
        s.name,
        "Results Count:",
        s.examResults.length
      );
    });

    // 🔹 Pagination meta
    const totalPages = Math.ceil(totalStudents / limit);
    const hasMore = page < totalPages;

    return res.json({
      total: totalStudents,
      page,
      limit,
      totalPages,
      hasMore,
      students: studentsWithResults,
    });
  } catch (err) {
    console.error("getAllExamResults:", err);
    return res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
  }
};




//
// ✅ 4. Unread Count (Student + Parent support)
//
exports.getStudentUnreadCount = async (req, res) => {
  try {
    if (req.user.role === "parent") {
      const parent = await User.findById(req.user.id).populate("children", "_id").lean();
      if (!parent?.children?.length) return res.status(200).json({ unread: 0 });

      const childIds = parent.children.map((c) => c._id);
      const count = await ExamResult.countDocuments({ studentId: { $in: childIds }, isRead: false });
      return res.status(200).json({ unread: count });
    }

    const studentId = req.user.role === "student" ? req.user.id : req.params.id;
    const count = await ExamResult.countDocuments({ studentId, isRead: false });
    return res.status(200).json({ unread: count });
  } catch (err) {
    console.error("getStudentUnreadCount:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};

//
// ✅ 5. Mark All Exam Results as Read
//
exports.markAllExamResultsReadForStudent = async (req, res) => {
  try {
    let studentIds = [];

    if (req.user.role === "student") {
      studentIds = [req.user.id];
    } else if (req.user.role === "parent") {
      const parent = await User.findById(req.user.id).populate("children", "_id").lean();
      if (!parent?.children?.length) return res.status(200).json({ modified: 0 });
      studentIds = parent.children.map((c) => c._id);
    } else {
      studentIds = [req.params.id];
    }

    const result = await ExamResult.updateMany(
      { studentId: { $in: studentIds }, isRead: false },
      { $set: { isRead: true } }
    );

    studentIds.forEach((sid) =>
      io?.to(String(sid)).emit("exam_result_update", { message: "Exam results marked as read" })
    );

    return res.status(200).json({ message: "Exam results marked as read", modified: result.modifiedCount });
  } catch (err) {
    console.error("markAllExamResultsReadForStudent:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};

//
// ✅ 6. Mark Single Exam Result as Read
//
exports.markExamResultAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid exam result ID" });
    }

    const result = await ExamResult.findOneAndUpdate(
      { _id: id, studentId: req.user.id },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!result) return res.status(404).json({ message: "Exam result not found" });

    io?.to(String(req.user.id)).emit("exam_result_update", {
      message: "Exam result marked as read",
      examResult: result,
    });

    return res.status(200).json({ message: "Exam result marked as read", result });
  } catch (err) {
    console.error("markExamResultAsRead:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};

//
// ✅ 7. Delete Exam Result (Admin/Teacher only)
//
exports.deleteExamResult = async (req, res) => {
  try {
    const { id } = req.params;
    if (!["admin", "teacher"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only Admin/Teacher can delete exam results" });
    }

    const examResult = await ExamResult.findById(id);
    if (!examResult) return res.status(404).json({ message: "Exam result not found" });

    const student = await User.findById(examResult.studentId);
    if (!student || student.schoolName !== req.user.schoolName) {
      return res.status(403).json({ message: "Access denied: Different school" });
    }

    await examResult.deleteOne();

    io?.to(String(student._id)).emit("exam_result_update", {
      message: "Exam result deleted",
      examResult,
    });

    return res.status(200).json({ message: "Exam result deleted successfully" });
  } catch (err) {
    console.error("deleteExamResult:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};

//
// ✅ 8. Update Exam Result (Admin/Teacher only)
//
exports.updateExamResult = async (req, res) => {
  try {
    const { id } = req.params;
    const patch = req.body;

    if (req.user.role === "student") {
      return res.status(403).json({ message: "Students cannot update exam results" });
    }

    const existing = await ExamResult.findById(id);
    if (!existing) return res.status(404).json({ message: "Exam result not found" });

    const student = await User.findById(existing.studentId);
    if (!student || student.schoolName !== req.user.schoolName) {
      return res.status(403).json({ message: "Access denied: Different school" });
    }

    const updated = await ExamResult.findByIdAndUpdate(id, patch, { new: true });

    io?.to(String(updated.studentId)).emit("exam_result_update", {
      message: "Exam result updated",
      examResult: updated,
    });

    return res.status(200).json({ message: "Exam result updated successfully", updated });
  } catch (err) {
    console.error("updateExamResult:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};
