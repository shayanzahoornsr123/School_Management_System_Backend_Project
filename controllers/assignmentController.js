// controllers/assignmentController.js
const Assignment = require("../models/Assignment");
const User = require("../models/User");
const cloudinary = require("../utils/cloudinary");


/* ==========================================================
   📘 Create Assignment (Teacher/Admin only)
========================================================== */
exports.createAssignment = async (req, res) => {
  try {
    const { title, description = "", subject, dueDate, className, section } = req.body;

    if (!title || !dueDate || !className || !section) {
      return res.status(400).json({ message: "title, dueDate, className & section are required" });
    }

    const user = await User.findById(req.user._id)
      .select("_id schoolName")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    const payload = {
      title,
      description,
      subject,
      dueDate: new Date(dueDate),
      className,
      section,
      createdBy: user._id,
      schoolName: user.schoolName,
    };

    // ======================================================
    // 📁 FILE UPLOAD (IMAGE / VIDEO / PDF / DOC SUPPORT)
    // ======================================================
    if (req.file) {

      // 🔥 Detect file type properly
      let resourceType = "raw"; // default for pdf, docs

      if (req.file.mimetype.startsWith("image")) {
        resourceType = "image";
      } else if (req.file.mimetype.startsWith("video")) {
        resourceType = "video";
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "assignments",
        resource_type: resourceType,
      });

      payload.fileUrl = result.secure_url;
      payload.filePublicId = result.public_id;
      payload.fileType = result.format;
      payload.fileSize = result.bytes;

      payload.fileResourceType = resourceType;
    }

    const assignment = await Assignment.create(payload);

    return res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      data: assignment,
    });

  } catch (err) {
    console.error("createAssignment:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};



/* ==========================================================
   📚 Get Assignments (Student / Parent / Teacher / Admin)
========================================================== */
exports.getAssignments = async (req, res) => {
  try {
    let { className, section, page = 1, limit = 25 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const user = await User.findById(req.user._id)
      .select("role schoolName className section children")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    // STUDENT
    if (user.role === "student") {
      className = user.className;
      section = user.section;
    }

    // PARENT (optimized: no extra query)
    else if (user.role === "parent") {
      if (!user.children?.length) {
        return res.status(404).json({ message: "No linked children found" });
      }

      const child = await User.findById(user.children[0])
        .select("className section")
        .lean();

      if (!child) return res.status(404).json({ message: "Child not found" });

      className = child.className;
      section = child.section;
    }

    // TEACHER / ADMIN
    else {
      if (!className || !section) {
        return res.status(400).json({ message: "className and section required" });
      }
    }

    const query = {
      schoolName: user.schoolName,
      className,
      section,
    };

    if (req.query.subject) query.subject = req.query.subject;

    if (req.query.q) {
      const regex = new RegExp(req.query.q, "i");
      query.$or = [{ title: regex }, { description: regex }, { subject: regex }];
    }

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .sort({ dueDate: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("createdBy", "name role")
        .lean(),

      Assignment.countDocuments(query),
    ]);

    return res.json({
      message: "Assignments fetched successfully",
      className,
      section,
      page,
      pages: Math.ceil(total / limit),
      total,
      assignments,
    });
  } catch (err) {
    console.error("getAssignments:", err);
    return res.status(500).json({ message: err.message });
  }
};


/* ==========================================================
   📘 Get Single Assignment
========================================================== */
exports.getAssignmentById = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("role schoolName className section children")
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    const assignment = await Assignment.findById(req.params.id).lean();
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    if (assignment.schoolName !== user.schoolName) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (user.role === "student") {
      if (assignment.className !== user.className || assignment.section !== user.section) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    if (user.role === "parent" && user.children?.length) {
      const child = await User.findById(user.children[0])
        .select("className section")
        .lean();

      if (!child || assignment.className !== child.className || assignment.section !== child.section) {
        return res.status(403).json({ message: "Not allowed" });
      }
    }

    return res.status(200).json({ success: true, data: assignment });
  } catch (err) {
    console.error("getAssignmentById:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


/* ==========================================================
   ✏️ Update Assignment
========================================================== */
exports.updateAssignment = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("schoolName")
      .lean();

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (assignment.schoolName !== user.schoolName) {
      return res.status(403).json({ message: "Access denied" });
    }

    // ======================================================
    // 📁 FILE REPLACEMENT (SAFE CLOUDINARY UPDATE)
    // ======================================================
    if (req.file) {

      // 🔥 DELETE OLD FILE SAFELY
      if (assignment.filePublicId) {
        await cloudinary.uploader.destroy(assignment.filePublicId, {
          resource_type: assignment.fileResourceType || "raw",
        });
      }

      // 🔥 DETECT NEW FILE TYPE
      let resourceType = "raw";

      if (req.file.mimetype.startsWith("image")) {
        resourceType = "image";
      } else if (req.file.mimetype.startsWith("video")) {
        resourceType = "video";
      }

      // 🔥 UPLOAD NEW FILE
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "assignments",
        resource_type: resourceType,
      });

      // 🔥 UPDATE FILE DATA
      assignment.fileUrl = result.secure_url;
      assignment.filePublicId = result.public_id;
      assignment.fileType = result.format;
      assignment.fileSize = result.bytes;

      // 🔥 IMPORTANT (for delete later)
      assignment.fileResourceType = resourceType;
    }

    // ======================================================
    // ✏️ UPDATE OTHER FIELDS
    // ======================================================
    Object.assign(assignment, req.body);

    await assignment.save();

    return res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      data: assignment,
    });

  } catch (err) {
    console.error("updateAssignment:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};


/* ==========================================================
   ❌ Delete Assignment
========================================================== */
exports.deleteAssignment = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("schoolName")
      .lean();

    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (assignment.schoolName !== user.schoolName) {
      return res.status(403).json({ message: "Access denied" });
    }

    // ======================================================
    // ☁️ DELETE FILE FROM CLOUDINARY (SAFE FIX)
    // ======================================================
    if (assignment.filePublicId) {

      await cloudinary.uploader.destroy(assignment.filePublicId, {
        resource_type: assignment.fileResourceType || "raw",
      });

    }

    // ======================================================
    // 🗑 DELETE FROM DATABASE
    // ======================================================
    await Assignment.deleteOne({ _id: req.params.id });

    return res.status(200).json({
      success: true,
      message: "Assignment deleted successfully",
    });

  } catch (err) {
    console.error("deleteAssignment:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
