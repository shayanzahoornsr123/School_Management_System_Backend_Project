const DateSheet = require('../models/DateSheet');
const User = require('../models/User');

// 🔹 Helper
const sendResponse = (res, success, message, data = null, status = 200) => {
  return res.status(status).json({ success, message, data });
};

/* ==========================================================
   ✅ CREATE DATE SHEET (OPTIMIZED)
========================================================== */
exports.createDateSheet = async (req, res) => {
  try {
    const { className, section, examType, subjects } = req.body;

    if (!className || !section || !examType || !subjects?.length) {
      return sendResponse(res, false, 'Missing required fields', null, 400);
    }

    if (Array.isArray(examType)) {
      return sendResponse(res, false, 'examType must be string', null, 400);
    }

    const user = await User.findById(req.user._id)
      .select('_id schoolName')
      .lean();

    if (!user) {
      return sendResponse(res, false, 'User not found', null, 404);
    }

    const dateSheet = await DateSheet.create({
      schoolName: user.schoolName,
      className: className.trim(),
      section: section.trim(),
      examType: examType.trim(),
      teacherId: user._id,
      subjects,
      createdBy: user._id,
    });

    return sendResponse(res, true, 'Created successfully', dateSheet, 201);

  } catch (err) {
    console.error('createDateSheet:', err);
    return sendResponse(res, false, err.message, null, 500);
  }
};


/* ==========================================================
   ✅ GET ALL DATE SHEETS (PAGINATED + FAST)
========================================================== */
exports.getAllDateSheets = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const user = await User.findById(req.user._id)
      .select('schoolName')
      .lean();

    if (!user) {
      return sendResponse(res, false, 'User not found', null, 404);
    }

    const query = { schoolName: user.schoolName };

    const [dateSheets, total] = await Promise.all([
      DateSheet.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('className section examType subjects teacherId createdAt')
        .populate('teacherId', 'name email')
        .lean(),

      DateSheet.countDocuments(query)
    ]);

    return sendResponse(res, true, 'Fetched successfully', {
      page,
      total,
      pages: Math.ceil(total / limit),
      data: dateSheets,
    });

  } catch (err) {
    console.error('getAllDateSheets:', err);
    return sendResponse(res, false, err.message, null, 500);
  }
};


/* ==========================================================
   ✅ GET CLASS DATE SHEETS (SCALABLE + OPTIMIZED)
========================================================== */
exports.getClassDateSheets = async (req, res) => {
  try {
    let { className, section, examType, page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const user = await User.findById(req.user._id)
      .select('role schoolName className section children')
      .lean();

    if (!user) {
      return sendResponse(res, false, 'User not found', null, 404);
    }

    // 🎓 STUDENT (no extra query)
    if (user.role === 'student') {
      className = user.className;
      section = user.section;
    }

    // 👨‍👩‍👧 PARENT (only ONE extra query)
    else if (user.role === 'parent') {
      if (!user.children?.length) {
        return sendResponse(res, false, 'No child found', null, 400);
      }

      const child = await User.findById(user.children[0])
        .select('className section')
        .lean();

      if (!child) {
        return sendResponse(res, false, 'Child not found', null, 404);
      }

      className = child.className;
      section = child.section;
    }

    if (!className || !section) {
      return sendResponse(res, false, 'className & section required', null, 400);
    }

    if (examType && Array.isArray(examType)) {
      return sendResponse(res, false, 'examType must be string', null, 400);
    }

    const query = {
      schoolName: user.schoolName,
      className,
      section,
    };

    if (examType) query.examType = examType.trim();

    const [dateSheets, total] = await Promise.all([
      DateSheet.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('examType subjects teacherId createdAt')
        .populate('teacherId', 'name email')
        .lean(),

      DateSheet.countDocuments(query)
    ]);

    return sendResponse(res, true, 'Fetched successfully', {
      page,
      total,
      pages: Math.ceil(total / limit),
      data: dateSheets,
    });

  } catch (err) {
    console.error('getClassDateSheets:', err);
    return sendResponse(res, false, err.message, null, 500);
  }
};


// ✅ Update DateSheet (Teacher/Admin of same school)
exports.updateDateSheet = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .select("schoolName")
      .lean();

    if (!user?.schoolName) {
      return sendResponse(res, false, "User or school not found", null, 400);
    }

    const updates = { ...req.body };

    // Trim string fields safely
    ["className", "section", "examType", "schoolName"].forEach(field => {
      if (updates[field] && typeof updates[field] === "string") {
        updates[field] = updates[field].trim();
      }
    });

    // Remove empty strings / null / undefined
    Object.keys(updates).forEach(key => {
      if (updates[key] === "" || updates[key] === null || updates[key] === undefined) {
        delete updates[key];
      }
    });

    // Convert ObjectId strings
    const mongoose = require("mongoose");
    const objectIdFields = ["teacherId", "createdBy"];
    objectIdFields.forEach(key => {
      if (updates[key] && typeof updates[key] === "string") {
        updates[key] = new mongoose.Types.ObjectId(updates[key]);
      }
    });

    // Atomic update
    const dateSheet = await DateSheet.findOneAndUpdate(
      { _id: req.params.id, schoolName: user.schoolName },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!dateSheet) {
      return sendResponse(res, false, "DateSheet not found", null, 404);
    }

    return sendResponse(res, true, "Updated successfully", dateSheet);

  } catch (err) {
    console.error("updateDateSheet:", err);
    return sendResponse(res, false, err.message, null, 500);
  }
};

// ✅ Delete DateSheet
exports.deleteDateSheet = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .select("schoolName")
      .lean();

    if (!user?.schoolName) {
      return sendResponse(res, false, "User or school not found", null, 400);
    }

    // 🔥 Direct delete (no fetch first)
    const result = await DateSheet.deleteOne({
      _id: req.params.id,
      schoolName: user.schoolName,
    });

    if (result.deletedCount === 0) {
      return sendResponse(res, false, "DateSheet not found", null, 404);
    }

    return sendResponse(res, true, "Deleted successfully");

  } catch (err) {
    console.error("deleteDateSheet:", err);
    return sendResponse(res, false, err.message, null, 500);
  }
};


// ✅ Get single DateSheet by ID
exports.getDateSheetById = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId)
      .select("schoolName")
      .lean();

    if (!user?.schoolName) {
      return sendResponse(res, false, "User or school not found", null, 400);
    }

    const dateSheet = await DateSheet.findOne({
      _id: req.params.id,
      schoolName: user.schoolName,
    })
      .populate("teacherId", "name email")
      .lean();

    if (!dateSheet) {
      return sendResponse(res, false, "DateSheet not found", null, 404);
    }

    return sendResponse(res, true, "Fetched successfully", dateSheet);

  } catch (err) {
    console.error("getDateSheetById:", err);
    return sendResponse(res, false, err.message, null, 500);
  }
};
