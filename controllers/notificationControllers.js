const admin = require("../firebase"); // Firebase Admin SDK
const Notification = require("../models/NotificationModel");
const User = require("../models/User");

// ------------------------------
// 📨 Send Notification to Class + Section
// ------------------------------
exports.sendNotificationToClass = async (req, res) => {
  try {
    const sender = await User.findById(req.user._id)
      .select("_id schoolName")
      .lean();

    if (!sender) {
      return res.status(404).json({ message: "User not found" });
    }

    const { title, body, className, section } = req.body;

    if (!title || !body || !className || !section) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // 🔥 Students (optimized)
    const students = await User.find({
      role: "student",
      schoolName: sender.schoolName,
      className,
      section,
    })
      .select("_id fcmToken")
      .lean();

    const studentIds = students.map(s => s._id);

    // 🔥 Parents (optimized)
    const parents = await User.find({
      role: "parent",
      schoolName: sender.schoolName,
      children: { $in: studentIds },
    })
      .select("_id fcmToken")
      .lean();

    const targetUsers = [
      ...studentIds,
      ...parents.map(p => p._id),
    ];

    // 🔥 Create notification
    const notification = await Notification.create({
      title,
      body,
      userId: sender._id,
      className,
      section,
      schoolName: sender.schoolName,
      targetUsers,
      type: "class",
    });

    // 🔥 Extract tokens (ARRAY SAFE)
    const tokens = [
      ...students.flatMap(s => s.fcmToken || []),
      ...parents.flatMap(p => p.fcmToken || []),
    ];

    // 🔥 Remove duplicates
    const uniqueTokens = [...new Set(tokens)];

    // 🔥 Chunk sending
    const chunkSize = 500;
    for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
      const chunk = uniqueTokens.slice(i, i + chunkSize);

      await admin.messaging().sendEachForMulticast({
        notification: { title, body },
        tokens: chunk,
      });
    }

    return res.json({
      success: true,
      notification,
    });

  } catch (error) {
    console.error("CLASS NOTIFICATION ERROR:", error);
    return res.status(500).json({ success: false });
  }
};


exports.sendNotificationToStudent = async (req, res) => {
  try {
    const sender = await User.findById(req.user._id)
      .select("_id")
      .lean();

    const { studentId, title, body } = req.body;

    const student = await User.findById(studentId)
      .select("_id className section schoolName fcmToken")
      .lean();

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // 🔹 Find parents (optimized)
    const parents = await User.find({
      role: "parent",
      children: student._id,
    })
      .select("_id fcmToken")
      .lean();

    const parentIds = parents.map(p => p._id);

    const targetUsers = [student._id, ...parentIds];

    const notification = await Notification.create({
      title,
      body,
      userId: sender._id,
      schoolName: student.schoolName,
      className: student.className,
      section: student.section,
      targetUsers,
      type: "individual",
      readBy: [],
    });

    // 🔹 Send FCM (array-safe + optimized)
    const recipients = [student, ...parents];

    const tokens = recipients
      .flatMap(u => u.fcmToken || [])
      .filter(Boolean);

    const uniqueTokens = [...new Set(tokens)];

    if (uniqueTokens.length > 0) {
      await admin.messaging().sendEachForMulticast({
        notification: { title, body },
        tokens: uniqueTokens,
      });
    }

    res.json({ success: true, notification });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
};


// ------------------------------
// 📜 Get Notifications (Student + Parent)
// ------------------------------
exports.getNotificationsByUser = async (req, res) => {
  try {
    
    const userId = req.user._id;

    let { page = 1, limit = 30 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const notifications = await Notification.find({
      targetUsers: userId,
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const formatted = notifications.map(n => ({
      ...n,
      read: n.readBy?.some(id => id.toString() === userId.toString()),
    }));

    return res.json({
      success: true,
      page,
      count: notifications.length,
      notifications: formatted,
    });

  } catch (error) {
    console.error("GET NOTIFICATIONS ERROR:", error);
    return res.status(500).json({ success: false });
  }
};


// ------------------------------
// ✅ Mark Notification as Read
// ------------------------------
exports.markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const updated = await Notification.findByIdAndUpdate(
      req.params.notificationId,
      { $addToSet: { readBy: userId } },
      { new: true }
    );

    res.json({ success: true, notification: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
};

// ------------------------------
// 🔢 Get Unread Notification Count
// ------------------------------
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const latestNotifications = await Notification.find({
      targetUsers: userId,
    })
      .sort({ createdAt: -1 })
      .select("_id readBy")
      .lean();

    const unreadCount = latestNotifications.filter(
      n => !n.readBy?.some(id => id.toString() === userId.toString())
    ).length;

    res.json({ success: true, count: unreadCount });

  } catch (error) {
    console.error("UNREAD COUNT ERROR:", error);
    res.status(500).json({ success: false });
  }
};

// ------------------------------
// 🔔 Register / Update FCM Token
// ------------------------------
exports.registerToken = async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    if (!userId || !fcmToken)
      return res.status(400).json({ message: "userId and fcmToken are required" });

    await User.findByIdAndUpdate(userId, { fcmToken }, { new: true });
    res.status(200).json({ success: true, message: "FCM token registered successfully" });
  } catch (error) {
    console.error("Error registering token:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};