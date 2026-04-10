const TimeTable = require("../models/TimeTable");
const User = require("../models/User");
const cloudinary = require("../utils/cloudinary");


// 🟢 CREATE TIMETABLE (Admin/Teacher)
exports.createTimeTable = async (req, res) => {
  try {
    // ✅ Fetch only required fields (FASTER)
    const user = await User.findById(req.user._id)
      .select("_id schoolName")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.schoolName)
      return res.status(400).json({ message: "School information missing" });

    const { className, section, subject, day, startTime, endTime, teacherName } = req.body;

    let attachmentUrl = null;
    let attachmentPublicId = null;

    // 📎 Upload attachment (same logic)
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: `timetables/${user.schoolName.replace(/\s+/g, "_")}`,
      });
      attachmentUrl = result.secure_url;
      attachmentPublicId = result.public_id;
    }

    // ✅ Direct insert (fast)
    const timetable = await TimeTable.create({
      schoolName: user.schoolName,
      className,
      section,
      day,
      subject,
      startTime,
      endTime,
      teacherName,
      attachmentUrl,
      attachmentPublicId,
      createdBy: user._id,
    });

    res.status(201).json({
      message: "✅ Timetable created successfully",
      timetable,
    });
  } catch (err) {
    console.error("createTimeTable:", err);
    res.status(500).json({ message: err.message });
  }
};


// 🟡 GET ALL TIMETABLES (For a School)
exports.getAllTimeTables = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("schoolName")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    const schoolName = user.schoolName;
    if (!schoolName)
      return res.status(400).json({ message: "School information missing" });

    // ✅ PAGINATION (CRITICAL FOR SCALE)
    let { page = 1, limit = 30 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const timetables = await TimeTable.find({ schoolName })
      .sort({ day: 1, startTime: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("createdBy", "name email role")
      .lean();

    res.json({
      page,
      count: timetables.length,
      timetables,
    });
  } catch (err) {
    console.error("getAllTimeTables:", err);
    res.status(500).json({ message: err.message });
  }
};


// 🔵 GET CLASS TIMETABLE (Student/Teacher)
exports.getClassTimeTable = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("role schoolName className section children")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.schoolName)
      return res.status(400).json({ message: "School information missing" });

    let { className, section, day, page = 1, limit = 25 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // 🧑‍🎓 STUDENT
    if (user.role === "student") {
      className = user.className;
      section = user.section;
    }

    // 👨‍👩‍👧 PARENT (OPTIMIZED: single query)
    else if (user.role === "parent") {
      if (!user.children?.length) {
        return res.status(404).json({ message: "No linked children found" });
      }

      const child = await User.findById(user.children[0])
        .select("className section")
        .lean();

      if (!child) {
        return res.status(404).json({ message: "Child not found" });
      }

      className = child.className;
      section = child.section;
    }

    if (!className || !section) {
      return res.status(400).json({
        message: "className and section are required",
      });
    }

    const query = {
      schoolName: user.schoolName,
      className,
      section,
    };

    if (day) query.day = day;

    // ✅ PAGINATED + LEAN
    const [timetables, total] = await Promise.all([
  TimeTable.find(query)
    .sort({ day: 1, startTime: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate("createdBy", "name email role")
    .lean(),

  TimeTable.countDocuments(query),
]);

return res.json({
  page,
  pages: Math.ceil(total / limit),
  total,                            
  count: timetables.length,
  timetables,
});

  } catch (err) {
    console.error("getClassTimeTable:", err);
    return res.status(500).json({ message: err.message });
  }
};


// 🟣 UPDATE TIMETABLE
exports.updateTimeTable = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.schoolName)
      return res.status(400).json({ message: "School information missing" });

    const updates = {};
    const fields = [
      "className",
      "section",
      "day",
      "subject",
      "startTime",
      "endTime",
      "teacherName",
    ];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    // 🖼️ Update attachment if new file provided
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: `timetables/${user.schoolName.replace(/\s+/g, "_")}`,
      });
      updates.attachmentUrl = result.secure_url;
      updates.attachmentPublicId = result.public_id;
    }

    const timetable = await TimeTable.findOneAndUpdate(
      { _id: req.params.id, schoolName: user.schoolName }, // ✅ filter by school
      updates,
      { new: true }
    );

    if (!timetable)
      return res
        .status(404)
        .json({ message: "Timetable not found or not in your school" });

    res.json({ message: "✅ Timetable updated successfully", timetable });
  } catch (err) {
    console.error("updateTimeTable:", err);
    res.status(500).json({ message: err.message });
  }
};

// 🔴 DELETE TIMETABLE
exports.deleteTimeTable = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.schoolName)
      return res.status(400).json({ message: "School information missing" });

    const timetable = await TimeTable.findOne({
      _id: req.params.id,
      schoolName: user.schoolName, // ✅ ensure belongs to this school
    });

    if (!timetable)
      return res
        .status(404)
        .json({ message: "Timetable not found or not in your school" });

    if (timetable.attachmentPublicId) {
      await cloudinary.uploader.destroy(timetable.attachmentPublicId);
    }

    await timetable.deleteOne();
    res.json({ message: "🗑️ Timetable deleted successfully" });
  } catch (err) {
    console.error("deleteTimeTable:", err);
    res.status(500).json({ message: err.message });
  }
};
