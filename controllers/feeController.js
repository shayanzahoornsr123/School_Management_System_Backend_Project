const Fee = require('../models/Fee');
const cloudinary = require('../utils/cloudinary');
const streamifier = require('streamifier');
const User = require('../models/User');

/**
 * ================= Assign Fee (Admin + Teacher) =================
 */
exports.assignFee = async (req, res) => {
  try {
    const { className, section, dueDate, issuedDate, amounts, statuses } = req.body;
    const schoolName = req.user.schoolName;

    if (!schoolName) return res.status(400).json({ message: "Missing schoolName" });
    if (!className || !section || !dueDate || !amounts?.length)
      return res.status(400).json({ message: "Missing required fields" });

    // 🔥 Fetch only required fields
    const students = await User.find({
      className,
      section,
      role: "student",
      schoolName,
    })
      .select("_id className section rollNumber")
      .lean();

    if (!students.length) {
      return res.status(404).json({ message: "No students found" });
    }

    if (amounts.length !== students.length || statuses.length !== students.length) {
      return res.status(400).json({ message: "Amounts/status mismatch" });
    }

    const now = new Date();

    // 🔥 BULK CREATE (SUPER FAST)
    const feeDocs = students.map((student, i) => ({
      studentId: student._id,
      className: student.className,
      section: student.section,
      rollNumber: student.rollNumber,
      schoolName,
      amount: amounts[i],
      dueDate: new Date(dueDate),
      issuedDate: issuedDate ? new Date(issuedDate) : now,
      status: statuses[i] || "Unpaid",
      createdAt: now,
      updatedAt: now,
    }));

    const fees = await Fee.insertMany(feeDocs);

    // 🔥 Socket emit (non-blocking)
    if (global.io) {
      students.forEach((s) => {
        global.io.to(`student_${s._id}`).emit("newFee", {
          message: "New fee assigned",
        });
      });
    }

    return res.status(201).json({
      message: `Fees assigned to ${fees.length} students`,
    });

  } catch (err) {
    console.error("Assign Fee Error:", err);
    res.status(500).json({ error: err.message });
  }
};


// GetFeesByClassandSection
exports.getFeesByClass = async (req, res) => {
  try {
    let { className, section, page = 1, limit = 60 } = req.query;
    const schoolName = req.user.schoolName;

    // Parse pagination values
    page = parseInt(page);
    limit = Math.min(parseInt(limit), 60);
    const skip = (page - 1) * limit;

    // Validate school
    if (!schoolName) {
      return res.status(400).json({ message: "Missing schoolName in user record" });
    }

    // Override for student role
    if (req.user && req.user.role === "student") {
      className = req.user.className;
      section = req.user.section;
    }

    if (!className || !section) {
      return res.status(400).json({ message: "className and section are required" });
    }

    // 1️⃣ Count total students in this class/section
    const total = await User.countDocuments({ role: "student", className, section, schoolName });

    // 2️⃣ Fetch students for current page
    const students = await User.find({ role: "student", className, section, schoolName })
      .select("name email rollNumber className section")
      .skip(skip)
      .limit(limit)
      .lean();

    if (!students.length) {
      return res.status(404).json({ message: "No students found" });
    }

    // 3️⃣ Fetch fees for these students
    const fees = await Fee.find({ studentId: { $in: students.map(s => s._id) }, schoolName })
      .populate("studentId", "name email rollNumber className section")
      .sort({ createdAt: -1 })
      .lean();

    // 4️⃣ Map fees to students
    const feeMap = {};
    fees.forEach(f => {
      const sid = String(f.studentId?._id || f.studentId);
      if (!feeMap[sid]) feeMap[sid] = [];
      feeMap[sid].push(f);
    });

    const studentsWithFees = students.map(s => ({ ...s, fees: feeMap[String(s._id)] || [] }));

    // 5️⃣ Return paginated response
    return res.json({
      success: true,
      total,                     // total students
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
      students: studentsWithFees, // student list with fees
    });

  } catch (err) {
    console.error("getFeesByClass Error:", err);
    return res.status(500).json({ success: false, message: "Server Error", error: err.message });
  }
};


/**
 * ================= Get Fees by Student =================
 */
exports.getFeesByStudent = async (req, res) => {
  try {
    let { page = 1, limit = 15 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    const user = await User.findById(req.user._id)
      .select("role children schoolName className section")
      .lean();

    let studentId;

    if (user.role === "student") {
      studentId = user._id;
    } else if (user.role === "parent") {
      if (!user.children?.length) {
        return res.status(400).json({ message: "No children found" });
      }
      studentId = user.children[0];
    } else {
      studentId = req.params.id;
    }

    const fees = await Fee.find({
      studentId,
      schoolName: user.schoolName,
    })
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Fee.countDocuments({
      studentId,
      schoolName: user.schoolName,
    });

    return res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
      fees,
    });

  } catch (err) {
    console.error("getFeesByStudent:", err);
    res.status(500).json({ error: err.message });
  }
};



/**
 * ================= Pay Fee (with Proof Image) =================
 */
function uploadBufferToCloudinary(buffer, filename, folder = 'fees') {
  return new Promise((resolve, reject) => {
    const publicIdBase = `${folder}/${Date.now()}_${filename.replace(/\s+/g, '_')}`;
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', public_id: publicIdBase },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}


exports.payFee = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount = null, method = 'Manual', txRef = null, paidAt = null } = req.body;

    const fee = await Fee.findById(id);
    if (!fee) return res.status(404).json({ message: 'Fee not found' });
    if (!req.file?.buffer) return res.status(400).json({ message: 'Payment proof image required' });

    const result = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname);
    const payAmount = amount ? Number(amount) : fee.amount - fee.paidAmount;
    if (payAmount <= 0) return res.status(400).json({ message: 'Invalid payment amount' });

    fee.paidAmount += payAmount;
    fee.paymentHistory.push({
      amount: payAmount,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      method,
      txRef,
      proofImage: result.secure_url,
    });

    fee.status = fee.paidAmount >= fee.amount ? 'Paid' : 'PartiallyPaid';
    if (fee.paidAmount > fee.amount) fee.paidAmount = fee.amount;

    await fee.save();
    res.json({ message: 'Payment recorded with proof', fee });
  } catch (err) {
    console.error('Pay Fee Error:', err);
    res.status(500).json({ error: err.message });
  }
};



/**
 * ================= Delete Fee =================
 */
exports.deleteFee = async (req, res) => {
  try {
    const result = await Fee.deleteOne({
      _id: req.params.id,
      schoolName: req.user.schoolName,
    });

    if (!result.deletedCount) {
      return res.status(404).json({ message: "Fee not found" });
    }

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


/**
 * ================= Get Unread Fees (Student) =================
 */
exports.getUnreadFees = async (req, res) => {
  try {
    const fees = await Fee.find({
      studentId: req.user._id,
      schoolName: req.user.schoolName,
      readBy: { $ne: req.user._id },
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ totalUnread: fees.length, fees });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


/**
 * ================= Get Read Fees (Student) =================
 */
exports.getReadFees = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'student') return res.status(403).json({ message: 'Access denied' });

    const readFees = await Fee.find({
      studentId: req.user._id,
      schoolName: req.user.schoolName,
      readBy: req.user._id,
      amount: { $gt: 0 },
    }).sort({ createdAt: -1 });

    res.json({ totalRead: readFees.length, fees: readFees });
  } catch (err) {
    console.error('getReadFees Error:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * ================= Mark Fee as Read (Student) =================
 */
exports.markFeeAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user || req.user.role !== 'student') return res.status(403).json({ message: 'Access denied' });

    const fee = await Fee.findOne({ _id: id, schoolName: req.user.schoolName });
    if (!fee) return res.status(404).json({ message: 'Fee not found or unauthorized school access' });

    if (fee.amount === 0) return res.status(400).json({ message: 'Fee amount is 0, cannot mark as read' });

    if (!fee.readBy.includes(req.user._id)) {
      fee.readBy.push(req.user._id);
      await fee.save();
    }

    res.json({ message: 'Fee marked as read', fee });
  } catch (err) {
    console.error('markFeeAsRead Error:', err);
    res.status(500).json({ message: err.message });
  }
};