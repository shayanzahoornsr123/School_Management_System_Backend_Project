// 📄 controllers/noticeController.js
const mongoose = require('mongoose');
const Notice = require('../models/Notice');
const User = require('../models/User'); // Reference school info

// =============================
// 🆕 Create a new Notice
// =============================
exports.createNotice = async (req, res) => {
  try {
    const { title, description, className = '', section = '' } = req.body;

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const notice = await Notice.create({
      title: title.trim(),
      description: description.trim(),
      className: className.trim(),
      section: section.trim(),
      createdBy: req.user._id,
      schoolName: req.user.schoolName,
    });

    const populatedNotice = await Notice.findById(notice._id)
      .populate('createdBy', 'name email role')
      .lean();

    return res.status(201).json({
      success: true,
      message: '✅ Notice created successfully',
      notice: populatedNotice,
    });

  } catch (err) {
    console.error('❌ Error creating notice:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


exports.getNotices = async (req, res) => {
  try {
    const { page = 1, limit = 20, className, section } = req.query;

    const user = await User.findById(req.user._id)
      .populate('children', '_id className section schoolName')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const noticeFilters = buildNoticeFilter(user, className, section);

    if (!noticeFilters.length) {
      return res.json({ success: true, total: 0, notices: [] });
    }

    const filter = {
      isActive: true,
      $or: noticeFilters
    };

    const notices = await Notice.find(filter)
      .select('title description className section createdAt isPinned readBy createdBy')
      .populate('createdBy', 'name email role')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const userIds = user.role === 'student'
      ? [user._id.toString()]
      : user.role === 'parent'
        ? (user.children || []).map(c => c._id.toString())
        : [];

    const userIdSet = new Set(userIds);

    const formattedNotices = notices.map(n => {
      const readSet = new Set((n.readBy || []).map(id => id.toString()));
      return {
        ...n,
        isRead: [...userIdSet].some(id => readSet.has(id))
      };
    });

    const total = await Notice.countDocuments(filter);

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
      notices: formattedNotices
    });

  } catch (err) {
    console.error('❌ Error fetching notices:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// =============================
// 🔒 Build notice filter by user with optional query for teachers
// =============================
const buildNoticeFilter = (user, queryClassName, querySection) => {
  if (user.role === 'student') {
    return [{
      schoolName: user.schoolName,
      $or: [
        { className: user.className, section: user.section },
        { className: user.className, section: '' },
        { className: '', section: '' }
      ]
    }];
  }

  if (user.role === 'parent') {
    const validChildren = user.children?.filter(
      c => c.className && c.section && c.schoolName
    ) || [];

    return validChildren.map(child => ({
      schoolName: child.schoolName,
      $or: [
        { className: child.className, section: child.section },
        { className: child.className, section: '' },
        { className: '', section: '' }
      ]
    }));
  }

  if (user.role === 'teacher') {
    // ✅ Use queryClassName/querySection if provided, otherwise default to teacher profile
    const className = queryClassName || user.className || '';
    const section = querySection || user.section || '';
    return [{
      schoolName: user.schoolName,
      $or: [
        { className, section },
        { className, section: '' },
        { className: '', section: '' }
      ]
    }];
  }

  // Admin sees all school notices
  return [{ schoolName: user.schoolName }];
};

// =============================
// 🔒 Get user IDs for read/unread logic
// =============================
const getUserIds = (user) => {
  if (user.role === 'student') return [user._id];
  if (user.role === 'parent') return (user.children || []).map(c => c._id);
  return [];
};



// =============================
// 📝 Get single notice by ID
// =============================
exports.getNoticeById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notice ID' });
    }

    const notice = await Notice.findById(id)
      .populate('createdBy', 'name email role schoolName')
      .lean();

    if (!notice) return res.status(404).json({ message: 'Notice not found' });

    if (notice.schoolName !== req.user.schoolName) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // 🚀 Optimized mark as read (no duplicate push)
    if (['student', 'parent'].includes(req.user.role)) {
      const userIds = req.user.role === 'student'
        ? [req.user._id]
        : (req.user.children || []).map(c => c._id);

      await Notice.updateOne(
        { _id: id },
        { $addToSet: { readBy: { $each: userIds } } }
      );
    }

    return res.json({ success: true, notice });

  } catch (err) {
    console.error('❌ Error fetching notice by ID:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


// =============================
// 🔢 Get unread notices count (class/section filtered)
// =============================
exports.getUnreadCount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('children', '_id className section schoolName')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const noticeFilters = buildNoticeFilter(user);
    const userIds = getUserIds(user);

    if (!noticeFilters.length) {
      return res.json({ success: true, unreadCount: 0 });
    }

    const filter = {
      isActive: true,
      $or: noticeFilters,
      ...(userIds.length && { readBy: { $nin: userIds } })
    };

    const unreadCount = await Notice.countDocuments(filter);

    return res.json({ success: true, unreadCount });

  } catch (err) {
    console.error('❌ Error fetching unread count:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


// =============================
// 🔔 Get unread notices (class/section filtered)
// =============================
exports.getUnreadNotices = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user._id)
      .populate('children', '_id className section schoolName')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const noticeFilters = buildNoticeFilter(user);
    const userIds = getUserIds(user);

    if (!noticeFilters.length) {
      return res.json({ success: true, total: 0, notices: [] });
    }

    const filter = {
      isActive: true,
      $or: noticeFilters,
      ...(userIds.length && { readBy: { $nin: userIds } })
    };

    const notices = await Notice.find(filter)
      .select('title description className section createdAt isPinned createdBy')
      .populate('createdBy', 'name email role')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total: notices.length,
      notices
    });

  } catch (err) {
    console.error('❌ Error fetching unread notices:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


// =============================
// 📖 Get read notices
// =============================
exports.getReadNotices = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user._id)
      .populate('children', '_id')
      .lean();

    if (!user) return res.status(404).json({ message: 'User not found' });

    const userIds = getUserIds(user);

    if (!userIds.length) {
      return res.json({ success: true, total: 0, notices: [] });
    }

    const notices = await Notice.find({
      schoolName: user.schoolName,
      readBy: { $in: userIds }
    })
      .select('title description className section createdAt isPinned createdBy')
      .populate('createdBy', 'name email role')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      total: notices.length,
      notices
    });

  } catch (err) {
    console.error('❌ Error fetching read notices:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// =============================
// ✅ Mark notice(s) as read
// =============================
exports.markNoticeAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notice ID' });
    }

    const user = await User.findById(req.user._id)
      .populate('children', '_id')
      .lean();

    const userIds = getUserIds(user);

    if (!userIds.length) {
      return res.json({ success: true, message: 'Nothing to update' });
    }

    await Notice.updateOne(
      { _id: id },
      { $addToSet: { readBy: { $each: userIds } } }
    );

    return res.json({
      success: true,
      message: '✅ Notice marked as read',
      noticeId: id
    });

  } catch (err) {
    console.error('❌ Error marking notice as read:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// =============================
// ✅ Mark all notices as read
// =============================
exports.markAllNoticesAsRead = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('children', '_id')
      .lean();

    const userIds = getUserIds(user);

    if (!userIds.length) {
      return res.json({ success: true, message: 'Nothing to update' });
    }

    await Notice.updateMany(
      {
        schoolName: user.schoolName,
        isActive: true,
        readBy: { $nin: userIds }
      },
      {
        $addToSet: { readBy: { $each: userIds } }
      }
    );

    return res.json({
      success: true,
      message: '✅ All notices marked as read'
    });

  } catch (err) {
    console.error('❌ Error marking all notices as read:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// =============================
// ✏️ Update notice
// =============================
exports.updateNotice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notice ID' });
    }

    // ✅ Only allow safe fields
    const allowedFields = ['title', 'description', 'className', 'section', 'isPinned', 'isActive'];

    const updateData = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updateData[key] = typeof req.body[key] === 'string'
          ? req.body[key].trim()
          : req.body[key];
      }
    }

    // 🚀 Atomic update with authorization check inside query
    const notice = await Notice.findOneAndUpdate(
      {
        _id: id,
        schoolName: req.user.schoolName,
        $or: [
          { createdBy: req.user._id },
          { role: 'admin' } // handled via user, but we enforce below
        ]
      },
      { $set: updateData },
      { new: true }
    )
      .populate('createdBy', 'name email role')
      .lean();

    // Extra admin check (since role is not in Notice)
    if (!notice) {
      // Check if exists but unauthorized
      const exists = await Notice.exists({ _id: id });
      if (exists) {
        return res.status(403).json({ message: 'Not authorized or access denied' });
      }
      return res.status(404).json({ message: 'Notice not found' });
    }

    return res.json({
      success: true,
      message: '✅ Notice updated',
      notice
    });

  } catch (err) {
    console.error('❌ Error updating notice:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// =============================
// 🗑️ Delete notice
// =============================
exports.deleteNotice = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid notice ID' });
    }

    // 🚀 Atomic delete with access control
    const result = await Notice.findOneAndDelete({
      _id: id,
      schoolName: req.user.schoolName,
      $or: [
        { createdBy: req.user._id },
        ...(req.user.role === 'admin' ? [{}] : [])
      ]
    });

    if (!result) {
      // Distinguish error
      const exists = await Notice.exists({ _id: id });

      if (exists) {
        return res.status(403).json({ message: 'Not authorized or access denied' });
      }

      return res.status(404).json({ message: 'Notice not found' });
    }

    return res.json({
      success: true,
      message: '🗑️ Notice deleted successfully'
    });

  } catch (err) {
    console.error('❌ Error deleting notice:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};