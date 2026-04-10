const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const User = require("../models/User");

let ioInstance = null;

/**
 * Attach socket.io instance to controller
 */
exports.setSocketIO = (io) => {
  ioInstance = io;
};

/**
 * Normalize any given date to local midnight
 */
function normalizeToLocalMidnight(d) {
  const date = new Date(d);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * ===============================
 * MARK ATTENDANCE (Bulk - Teacher/Admin only)
 * ===============================
 */
exports.markAttendance = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const payloadList = req.body;

    if (!Array.isArray(payloadList) || payloadList.length === 0) {
      return res.status(400).json({ message: "Attendance list is required" });
    }

    if (!["teacher", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only teacher/admin can mark attendance" });
    }

    // Start transaction
    session.startTransaction();

    const teacher = await User.findById(req.user._id).lean();
    if (!teacher) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Teacher not found" });
    }

    // Extract all student IDs
    const studentIds = payloadList.map((p) => p.studentId);

    // Validate ObjectIds
    for (const id of studentIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Invalid studentId: ${id}` });
      }
    }

    // Fetch all students in ONE query
    const students = await User.find({
      _id: { $in: studentIds },
      role: "student",
      schoolName: teacher.schoolName,
    })
      .lean()
      .session(session);

    if (students.length !== studentIds.length) {
      await session.abortTransaction();
      return res.status(404).json({
        message: "Some students not found or do not belong to your school",
      });
    }

    // Map students for quick lookup
    const studentMap = {};
    students.forEach((s) => {
      studentMap[String(s._id)] = s;
    });

    // Prepare attendance documents
    const attendanceDocs = [];

    for (const payload of payloadList) {
      const { studentId, status, date, note } = payload;

      if (!studentId || !status) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "studentId and status are required for all records",
        });
      }

      const student = studentMap[String(studentId)];

      if (!student) {
        await session.abortTransaction();
        return res.status(404).json({
          message: `Student not found or not in your school: ${studentId}`,
        });
      }

      const selectedDate = date
        ? normalizeToLocalMidnight(date)
        : normalizeToLocalMidnight(new Date());

      attendanceDocs.push({
        studentId: student._id,
        rollNumber: student.rollNumber || "",
        className: student.className,
        section: student.section,
        schoolName: teacher.schoolName,
        status,
        note: note || "",
        date: selectedDate,
        createdBy: req.user._id,
      });
    }

    // Insert all at once (FAST)
    let insertedDocs;
    try {
      insertedDocs = await Attendance.insertMany(attendanceDocs, {
        session,
        ordered: false, // continue even if some fail (duplicate protection)
      });
    } catch (err) {
      // Handle duplicate key error (unique index)
      if (err.code === 11000) {
        await session.abortTransaction();
        return res.status(400).json({
          message: "Some attendance records already exist for given date",
        });
      }
      throw err;
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Emit only to school room (scalable socket)
    if (ioInstance) {
      ioInstance.to(teacher.schoolName).emit("attendanceMarked", insertedDocs);
    }

    return res.status(201).json({
      message: "Attendance marked successfully",
      attendance: insertedDocs,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error in markAttendance:", err);

    return res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
  }
};


/**
 * ===============================
 * GET ALL ATTENDANCE (Class/Section)
 * ===============================
 */
exports.getAllAttendance = async (req, res) => {
  try {
    let { className, section, date, page = 1, limit = 60 } = req.query;

    page = parseInt(page);  
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    // 🔥 Lightweight user fetch
    const currentUser = await User.findById(req.user._id)
      .select("schoolName")
      .lean();

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!className || !section) {
      return res.status(400).json({
        message: "className and section are required",
      });
    }

    // 🔥 1. Paginate STUDENTS
    const [students, totalStudents] = await Promise.all([
      User.find({
        role: "student",
        className,
        section,
        schoolName: currentUser.schoolName,
      })
        .select("_id name rollNumber className section")
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments({
        role: "student",
        className,
        section,
        schoolName: currentUser.schoolName,
      }),
    ]);

    if (!students.length) {
      return res.json({
        total: totalStudents,
        page,
        limit,
        totalPages: Math.ceil(totalStudents / limit),
        students: [],
      });
    }

    const studentIds = students.map((s) => s._id);

    // 🔥 2. Build attendance query
    const attendanceQuery = {
      studentId: { $in: studentIds },
      schoolName: currentUser.schoolName,
    };

    if (date) {
      const start = normalizeToLocalMidnight(date);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      attendanceQuery.date = { $gte: start, $lte: end };
    }

    // 🔥 3. Get ALL attendance for THESE students (no pagination on records)
    const records = await Attendance.find(attendanceQuery)
      .select("studentId status date note isRead")
      .sort({ date: -1 })
      .lean();

    // 🔥 4. Map attendance per student
    const attendanceMap = {};
    for (const rec of records) {
      const sid = String(rec.studentId);
      if (!attendanceMap[sid]) attendanceMap[sid] = [];
      attendanceMap[sid].push(rec);
    }

    // 🔥 5. Merge
    const studentsWithAttendance = students.map((s) => ({
      ...s,
      attendance: attendanceMap[String(s._id)] || [],
    }));

    return res.status(200).json({
      total: totalStudents,
      page,
      limit,
      totalPages: Math.ceil(totalStudents / limit),
      students: studentsWithAttendance,
    });

  } catch (err) {
    console.error("Error in getAllAttendance:", err);
    return res.status(500).json({
      message: "Server Error",
      error: err.message,
    });
  }
};



/**
 * ===============================
 * GET ATTENDANCE BY STUDENT
 * ===============================
 */
exports.getAttendanceByStudent = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .select("role schoolName children")
      .lean();

    if (!currentUser) return res.status(404).json({ message: "User not found" });

    let { from, to, unreadOnly, page = 1, limit = 30 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const filters = {};

    // STUDENT
    if (currentUser.role === "student") {
      filters.studentId = currentUser._id;
      filters.schoolName = currentUser.schoolName;
    }
    // PARENT
    else if (currentUser.role === "parent") {
      if (!currentUser.children?.length) {
        return res.status(404).json({ message: "No linked children found" });
      }
      const childIds = currentUser.children.map((c) => c);
      filters.studentId = { $in: childIds };
      filters.schoolName = currentUser.schoolName;
    }
    // TEACHER / ADMIN
    else if (["teacher", "admin"].includes(currentUser.role)) {
      const requestedId = req.params.id;

      if (requestedId) {
        if (!mongoose.Types.ObjectId.isValid(requestedId)) {
          return res.status(400).json({ message: "Invalid student ID" });
        }

        filters.studentId = requestedId;
      }

      filters.schoolName = currentUser.schoolName;
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    // DATE RANGE
    if (from || to) {
      filters.date = {};
      if (from) filters.date.$gte = normalizeToLocalMidnight(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        filters.date.$lte = toDate;
      }
    }

    if (unreadOnly === "true") filters.isRead = false;

    // 🔥 Parallel execution
    const [records, total] = await Promise.all([
      Attendance.find(filters)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Attendance.countDocuments(filters),
    ]);

    return res.status(200).json({
      total,
      page,
      pages: Math.ceil(total / limit),
      records,
    });
  } catch (err) {
    console.error("Error in getAttendanceByStudent:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};




/**
 * ===============================
 * GET UNREAD COUNT
 * ===============================
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .select("role schoolName children")
      .lean();

    if (!currentUser) return res.status(404).json({ message: "User not found" });

    const filter = { isRead: false, schoolName: currentUser.schoolName };

    if (currentUser.role === "student") {
      filter.studentId = currentUser._id;
    } else if (currentUser.role === "parent") {
      if (!currentUser.children?.length) {
        return res.status(200).json({ unread: 0 });
      }

      filter.studentId = { $in: currentUser.children };
    } else {
      return res.status(403).json({
        message: "Unread tracking not applicable for this role",
      });
    }

    const unread = await Attendance.countDocuments(filter);

    return res.status(200).json({ unread });
  } catch (err) {
    console.error("❌ Error in getUnreadCount:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};


/**
 * ===============================
 * MARK ALL READ (Student / Parent)
 * ===============================
 */
exports.markAllReadForStudent = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id)
      .select("role schoolName children")
      .lean();

    if (!currentUser) return res.status(404).json({ message: "User not found" });

    const filter = { isRead: false, schoolName: currentUser.schoolName };

    if (currentUser.role === "student") {
      filter.studentId = currentUser._id;
    } else if (currentUser.role === "parent") {
      if (!currentUser.children?.length) {
        return res.status(404).json({ message: "No linked children found" });
      }

      filter.studentId = { $in: currentUser.children };
    } else {
      return res.status(403).json({
        message: "Mark all read not applicable for this role",
      });
    }

    const result = await Attendance.updateMany(filter, {
      $set: { isRead: true },
    });

    return res.status(200).json({
      message: "All attendance marked as read",
      modified: result.modifiedCount,
    });
  } catch (err) {
    console.error("❌ Error in markAllReadForStudent:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};


/**
 * ===============================
 * UPDATE ATTENDANCE
 * ===============================
 */
exports.updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const currentUser = await User.findById(req.user._id)
      .select("schoolName")
      .lean();

    const attendance = await Attendance.findById(id).lean();

    if (!attendance) {
      return res.status(404).json({ message: "Attendance not found" });
    }

    if (attendance.schoolName !== currentUser.schoolName) {
      return res.status(403).json({
        message: "You can only update attendance for your school",
      });
    }

    const { status, note, date } = req.body;

    const patch = {};
    if (status) patch.status = status;
    if (note !== undefined) patch.note = note;
    if (date) patch.date = normalizeToLocalMidnight(date);

    const updated = await Attendance.findByIdAndUpdate(id, patch, {
      new: true,
    }).lean();

    if (!updated) return res.status(404).json({ message: "Not found" });

    if (ioInstance) {
      ioInstance.to(currentUser.schoolName).emit("attendanceUpdated", updated);
    }

    return res.status(200).json({
      message: "Updated",
      updated,
    });
  } catch (err) {
    console.error("Error in updateAttendance:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};


/**
 * ===============================
 * DELETE ATTENDANCE
 * ===============================
 */
exports.deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const currentUser = await User.findById(req.user._id)
      .select("schoolName")
      .lean();

    const attendance = await Attendance.findById(id).lean();

    if (!attendance) {
      return res.status(404).json({ message: "Attendance not found" });
    }

    if (attendance.schoolName !== currentUser.schoolName) {
      return res.status(403).json({
        message: "You can only delete attendance for your school",
      });
    }

    const deleted = await Attendance.findByIdAndDelete(id).lean();

    if (!deleted) return res.status(404).json({ message: "Not found" });

    if (ioInstance) {
      ioInstance.to(currentUser.schoolName).emit("attendanceDeleted", deleted);
    }

    return res.status(200).json({
      message: "Deleted",
      deleted,
    });
  } catch (err) {
    console.error("Error in deleteAttendance:", err);
    return res.status(500).json({ message: "Server Error", error: err.message });
  }
};