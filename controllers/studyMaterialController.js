const StudyMaterial = require("../models/StudyMaterial");
const User = require("../models/User"); // ✅ Import User model
const streamifier = require("streamifier");
const cloudinary = require("../utils/cloudinary");
const mongoose = require("mongoose");

/** ==========================================
 * Helper: Upload buffer to Cloudinary
 * ========================================== */
function uploadBufferToCloudinary(buffer, filename, folder = "study_materials") {
  return new Promise((resolve, reject) => {
    const publicIdBase = `${folder}/${Date.now()}_${filename
      .replace(/\s+/g, "_")
      .replace(/[^\w.-]/g, "")}`;
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto", public_id: publicIdBase },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

/** ==========================================
 * Create Study Material (Teacher/Admin)
 * ========================================== */
exports.createStudyMaterial = async (req, res) => {
  try {
    const {
      title,
      description,
      subject,
      className,
      section,
      tags,
      url,
    } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    const user = req.user; // 🔥 already available from middleware
    if (!user?.schoolName) {
      return res.status(400).json({ message: "School info missing" });
    }

    let fileMeta = {};
    let detectedType = "file";

    // 🔥 NON-BLOCKING upload
    if (req.file?.buffer) {
      try {
        const result = await uploadBufferToCloudinary(
          req.file.buffer,
          req.file.originalname
        );

        fileMeta = {
          fileUrl: result.secure_url,
          publicId: result.public_id,
          fileType: `${result.resource_type}/${result.format || ""}`,
          fileName: req.file.originalname,
          fileSize: req.file.size,
        };
      } catch (err) {
        console.warn("⚠️ File upload failed:", err.message);
      }
    }

    // 🔗 URL type detection
    if (url) {
      detectedType = url.includes("youtube") || url.includes("youtu.be")
        ? "youtube"
        : "link";
    }

    const material = await StudyMaterial.create({
      schoolName: user.schoolName,
      title: title.trim(),
      description,
      subject,
      className,
      section,
      uploadedBy: user._id,
      tags: tags
        ? (Array.isArray(tags)
            ? tags
            : tags.split(",").map(t => t.trim()))
        : [],
      url: url || "",
      type: detectedType,
      views: 0,
      downloads: 0,
      ...fileMeta,
    });

    return res.status(201).json({
      success: true,
      material,
    });

  } catch (err) {
    console.error("❌ createStudyMaterial:", err);
    res.status(500).json({ message: err.message });
  }
};


/** ==========================================
 * Get All Materials (Teacher/Admin/Student/Parent)
 * ========================================== */
exports.getAllMaterials = async (req, res) => {
  try {
    const user = req.user;

    if (!user?.schoolName) {
      return res.status(400).json({
        message: "User or school info missing",
      });
    }

    const {
      subject,
      className,
      section,
      q,
      type,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;

    const filter = { schoolName: user.schoolName };

    // ========================================
    // 🎓 ROLE FILTERING (SAFE)
    // ========================================
    if (user.role === "student") {
      filter.className = user.className;
      filter.section = user.section;
    }

    else if (user.role === "parent") {
      const parent = await User.findById(user._id)
        .select("children")
        .populate("children", "className section");

      const childFilters = parent.children
        .filter(c => c.className && c.section)
        .map(c => ({
          className: c.className,
          section: c.section,
        }));

      if (childFilters.length) {
        filter.$or = childFilters;
      }
    }

    else {
      if (className) filter.className = className;
      if (section) filter.section = section;
    }

    // ========================================
    // 🔍 SEARCH (SAFE MERGE)
    // ========================================
    if (q) {
      const regex = new RegExp(q, "i");

      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { title: regex },
          { description: regex },
          { tags: regex },
          { subject: regex },
        ],
      });
    }

    if (subject) filter.subject = subject;
    if (type) filter.type = type;

    // ========================================
    // 🚀 FAST QUERY (PARALLEL)
    // ========================================
    const [items, total] = await Promise.all([
      StudyMaterial.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .select("-__v") // 🔥 reduce payload
        .populate("uploadedBy", "name role")
        .lean(),

      StudyMaterial.countDocuments(filter),
    ]);

    return res.json({
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });

  } catch (err) {
    console.error("❌ getAllMaterials:", err);
    res.status(500).json({ message: err.message });
  }
};

/** ==========================================
 * 📚 Get Study Materials by Class & Section 
 * ========================================== */
exports.getMaterialsByClass = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 15,
      q,
      subject,
      type
    } = req.query;

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;

    // ✅ Single DB call (optimized)
    const user = await User.findById(req.user._id)
      .select("role schoolName className section children")
      .populate("children", "className section")
      .lean();

    if (!user || !user.schoolName) {
      return res.status(400).json({
        success: false,
        message: "User or school information not found."
      });
    }

    const filter = { schoolName: user.schoolName };

    // ========================================
    // 🎓 ROLE-BASED FILTERING
    // ========================================
    if (user.role === "student") {
      if (!user.className || !user.section) {
        return res.status(400).json({
          success: false,
          message: "Student class/section not set."
        });
      }

      filter.className = user.className;
      filter.section = user.section;
    }

    else if (user.role === "parent") {
      if (!user.children || user.children.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No children linked to this parent."
        });
      }

      const childFilters = user.children
        .filter(c => c.className && c.section)
        .map(c => ({
          className: c.className,
          section: c.section
        }));

      if (!childFilters.length) {
        return res.status(400).json({
          success: false,
          message: "Children missing className/section"
        });
      }

      filter.$or = childFilters;
    }

    else {
      const { className, section } = req.params;

      if (!className || !section) {
        return res.status(400).json({
          success: false,
          message: "className and section required"
        });
      }

      filter.className = className;
      filter.section = section;
    }

    // ========================================
    // 🔍 EXTRA FILTERS
    // ========================================
    if (subject) filter.subject = subject;
    if (type) filter.type = type;

    // 🔍 Search (SAFE merge with $or)
    if (q) {
      const regex = new RegExp(q, "i");

      const searchConditions = [
        { title: regex },
        { description: regex },
        { tags: regex },
        { subject: regex }
      ];

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    // ========================================
    // 🚀 PARALLEL QUERY (FAST)
    // ========================================
    const [items, total] = await Promise.all([
      StudyMaterial.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("uploadedBy", "name role") // lighter
        .lean(),

      StudyMaterial.countDocuments(filter)
    ]);

    // ========================================
    // 📦 RESPONSE
    // ========================================
    return res.json({
      success: true,
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum * limitNum < total,
        hasPrevPage: pageNum > 1
      }
    });

  } catch (err) {
    console.error("❌ getMaterialsByClass Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error"
    });
  }
};


/** ==========================================
 * Get Single Material (Track Views)
 * ========================================== */
exports.getMaterialById = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.schoolName) {
      return res.status(400).json({ message: "User or school information not found." });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid material ID" });

    const material = await StudyMaterial.findOne({
      _id: id,
      schoolName: user.schoolName, // ✅ isolation
    }).populate("uploadedBy", "name email role");

    if (!material) return res.status(404).json({ message: "Material not found or not in your school" });

    material.views = (material.views || 0) + 1;
    await material.save();

    return res.json({ material });
  } catch (err) {
    console.error("getMaterialById Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

/** ==========================================
 * Update Study Material
 * ========================================== */
exports.updateMaterial = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.schoolName) {
      return res.status(400).json({ message: "User or school information not found." });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid ID" });

    const material = await StudyMaterial.findOne({
      _id: id,
      schoolName: user.schoolName, // ✅ restrict by school
    });
    if (!material)
      return res.status(404).json({ message: "Material not found or not in your school" });

    // Replace file if new uploaded
    if (req.file && req.file.buffer) {
      if (material.publicId) {
        try {
          await cloudinary.uploader.destroy(material.publicId, { resource_type: "auto" });
        } catch (e) {
          console.warn("Cloudinary deletion failed:", e.message);
        }
      }
      const result = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname);
      material.fileUrl = result.secure_url;
      material.publicId = result.public_id;
      material.fileType = `${result.resource_type}${result.format ? `/${result.format}` : ""}`;
      material.fileName = req.file.originalname;
      material.fileSize = req.file.size;
    }

    const updatable = ["title", "description", "subject", "className", "section", "url", "type", "tags"];
    updatable.forEach((key) => {
      if (req.body[key] !== undefined) {
        material[key] =
          key === "tags"
            ? Array.isArray(req.body.tags)
              ? req.body.tags
              : req.body.tags.split(",").map((t) => t.trim())
            : req.body[key];
      }
    });

    await material.save();
    return res.json({ message: "Updated successfully", material });
  } catch (err) {
    console.error("updateMaterial Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

/** ==========================================
 * Delete Material
 * ========================================== */
exports.deleteMaterial = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || !user.schoolName) {
      return res.status(400).json({ message: "User or school information not found." });
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid ID" });

    const material = await StudyMaterial.findOne({
      _id: id,
      schoolName: user.schoolName,
    });
    if (!material)
      return res.status(404).json({ message: "Material not found or not in your school" });

    if (material.publicId) {
      try {
        await cloudinary.uploader.destroy(material.publicId, { resource_type: "auto" });
      } catch (e) {
        console.warn("Cloudinary delete failed:", e.message);
      }
    }

    await material.deleteOne();
    return res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("deleteMaterial Error:", err);
    return res.status(500).json({ message: err.message });
  }
};

/** ==========================================
 * Mark Complete / Incomplete (Students only)
 * ========================================== */
exports.markComplete = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material)
      return res.status(404).json({ message: "Material not found" });

    const userId = req.user.id;
    if (!material.completedBy.includes(userId)) {
      material.completedBy.push(userId);
      await material.save();
    }

    res.json({ message: "Marked as complete", material });
  } catch (err) {
    console.error("markComplete Error:", err);
    res.status(500).json({ message: err.message });
  }
};

exports.markIncomplete = async (req, res) => {
  try {
    const material = await StudyMaterial.findById(req.params.id);
    if (!material)
      return res.status(404).json({ message: "Material not found" });

    const userId = req.user.id;
    material.completedBy = material.completedBy.filter(
      (uid) => uid.toString() !== userId.toString()
    );
    await material.save();

    res.json({ message: "Marked as incomplete", material });
  } catch (err) {
    console.error("markIncomplete Error:", err);
    res.status(500).json({ message: err.message });
  }
};

/** ==========================================
 * Track Download
 * ========================================== */
exports.trackDownload = async (req, res) => {
  try {
    const { id } = req.params;
    const material = await StudyMaterial.findById(id);
    if (!material) return res.status(404).json({ message: "Not found" });

    material.downloads = (material.downloads || 0) + 1;
    await material.save();

    res.json({ message: "Download recorded", downloads: material.downloads });
  } catch (err) {
    console.error("trackDownload Error:", err);
    res.status(500).json({ message: err.message });
  }
};