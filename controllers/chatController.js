const ChatRoom = require("../models/ChatRoom");
const Message = require("../models/Message");
const User = require("../models/User");
const cloudinary = require("../utils/cloudinary");

// =============================
// CREATE OR GET CHAT ROOM
// =============================
exports.createOrGetChatRoom = async (req, res) => {
  try {
    const { parentId, teacherId } = req.body;
    if (!parentId || !teacherId)
      return res.status(400).json({ message: "parentId & teacherId required" });

    const users = await User.find({ _id: { $in: [parentId, teacherId] } })
      .select("_id role schoolName name email profileImage lastSeen")
      .lean();

    if (users.length !== 2)
      return res.status(404).json({ message: "User not found" });

    const parent = users.find(u => u.role === "parent");
    const teacher = users.find(u => u.role === "teacher");

    if (!parent || !teacher)
      return res.status(400).json({ message: "Invalid roles" });

    if (parent.schoolName !== teacher.schoolName)
      return res.status(403).json({ message: "Different school not allowed" });

    const schoolName = parent.schoolName;

    // ✅ Sort participants consistently and create a unique key
    const participants = [parentId, teacherId].sort();
    const participantsKey = participants.join("_");

    // ✅ Find existing chat room
    let chatRoom = await ChatRoom.findOne({ participantsKey }).populate(
      "participants",
      "name email role profileImage lastSeen"
    );

    if (!chatRoom) {
      // ✅ Create new chat room safely
      chatRoom = new ChatRoom({
        schoolName,
        participants,
        participantsKey,
        lastMessage: "",
        lastMessageAt: null,
      });
      await chatRoom.save();
      chatRoom = await ChatRoom.findById(chatRoom._id).populate(
        "participants",
        "name email role profileImage lastSeen"
      );
    }

    return res.status(200).json(chatRoom);

  } catch (err) {
    console.error("CREATE CHAT ROOM ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};


// ---------------------------
// GET ALL CHAT ROOMS FOR LOGGED-IN USER
// ---------------------------
exports.getUserChatRooms = async (req, res) => {
  try {
    const userId = req.user.id;

    // 🔥 Update lastSeen (non-blocking)
    User.updateOne(
      { _id: userId },
      { $set: { lastSeen: new Date() } }
    ).exec();

    const chatRooms = await ChatRoom.find({
      participants: userId,
      deletedFor: { $ne: userId },
    })
      .sort({ lastMessageAt: -1 })
      .populate("participants", "name email role profileImage lastSeen")
      .lean();

    return res.status(200).json({
      count: chatRooms.length,
      hasMore: false,
      chatRooms,
    });

  } catch (err) {
    console.error("GET CHAT ROOMS ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};


// ---------------------------
// SEND MESSAGE (REST VERSION for Postman testing)
// ---------------------------
exports.sendMessage = async (req, res) => {
  try {
    const { chatRoomId, receiverId, text, attachments } = req.body;
    const senderId = req.user.id;

    if (!chatRoomId || !receiverId) {
      return res.status(400).json({ message: "chatRoomId & receiverId required" });
    }

    // 🔥 Validate chatRoom + authorization in ONE query
    const chatRoom = await ChatRoom.findOne({
      _id: chatRoomId,
      participants: senderId,
    }).select("_id participants");

    if (!chatRoom) {
      return res.status(403).json({ message: "Not authorized or chat not found" });
    }

    // 🔥 Create message (FAST)
    const message = await Message.create({
      chatRoom: chatRoomId,
      sender: senderId,
      receiver: receiverId,
      text,
      attachments,
    });

    // 🔥 Update chat room WITHOUT loading doc
    await ChatRoom.updateOne(
      { _id: chatRoomId },
      {
        $set: {
          lastMessage:
            text ||
            (attachments && attachments.length ? "📎 Attachment" : ""),
          lastMessageAt: new Date(),
        },
      }
    );

    return res.status(201).json(message);

  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ---------------------------
// GET MESSAGES IN A CHAT ROOM
// ---------------------------
exports.getMessages = async (req, res) => {
  try {
    const { chatRoomId } = req.params;
    const userId = req.user.id;

    let { page = 1, limit = 30 } = req.query;
    page = parseInt(page);
    limit = Math.min(parseInt(limit), 50);

    User.updateOne(
      { _id: userId },
      { $set: { lastSeen: new Date() } }
    ).exec();

    const chatRoom = await ChatRoom.findOne({
      _id: chatRoomId,
      participants: userId,
    }).select("_id");

    if (!chatRoom) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({
      chatRoom: chatRoomId,
      deletedFor: { $ne: userId },
      isDeletedForEveryone: false,
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("sender receiver text attachments createdAt messageType audioUrl audioDuration isRead")
      .lean();

    const orderedMessages = messages.reverse();

    return res.status(200).json({
      page,
      limit,
      hasMore: messages.length === limit,
      messages: orderedMessages,
    });

  } catch (err) {
    console.error("GET MESSAGES ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};


// GET /teachers?schoolName=XYZ
exports.getAllTeachers = async (req, res) => {
  try {
    let { schoolName, page = 1, limit = 20 } = req.query;

    if (!schoolName) {
      return res.status(400).json({ message: "schoolName is required" });
    }

    // Convert page & limit to integers safely
    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const skip = (page - 1) * limit;

    // Count total teachers
    const totalTeachers = await User.countDocuments({
      role: "teacher",
      schoolName,
    });

    // Fetch teachers with pagination
    const teachers = await User.find({
      role: "teacher",
      schoolName,
    })
      .select("name email profileImage lastSeen")
      .skip(skip)
      .limit(limit)
      .lean();

    // 🔹 Move console.log BEFORE return
    console.log("==================== Pagination ====================");
    console.log("Page:", page);
    console.log("Limit:", limit);
    console.log("Teachers fetched this page:", teachers.length);
    console.log("Total teachers in DB:", totalTeachers);
    console.log("Has more:", skip + teachers.length < totalTeachers);
    console.log("=====================================================");

    return res.status(200).json({
      count: teachers.length,
      total: totalTeachers,
      page,
      limit,
      hasMore: skip + teachers.length < totalTeachers,
      teachers,
    });

  } catch (err) {
    console.error("GET TEACHERS ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};


// GET /parents?schoolName=XYZ&page=1&limit=10
exports.getAllParents = async (req, res) => {
  try {
    let { schoolName, page = 1, limit = 25 } = req.query;

    if (!schoolName) {
      return res.status(400).json({ message: "schoolName is required" });
    }

    // Convert page & limit to integers safely
    page = parseInt(page);
    limit = parseInt(limit);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;

    const skip = (page - 1) * limit;

    // Count total parents
    const totalParents = await User.countDocuments({
      role: "parent",
      schoolName,
    });

    // Fetch parents with pagination
    const parents = await User.find({
      role: "parent",
      schoolName,
    })
      .select("name email profileImage lastSeen")
      .skip(skip)
      .limit(limit)
      .lean();

    const hasMore = skip + parents.length < totalParents;

    // ✅ Debug prints
    console.log("==================== Pagination ====================");
    console.log("Page:", page);
    console.log("Limit:", limit);
    console.log("Parents fetched this page:", parents.length);
    console.log("Total parents loaded:", skip + parents.length);
    console.log("Has more:", hasMore);
    console.log("=====================================================");

    return res.status(200).json({
      count: parents.length,
      total: totalParents,
      page,
      limit,
      hasMore,
      parents,
    });

  } catch (err) {
    console.error("GET PARENTS ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};


// ---------------------------
// UNREAD MESSAGE COUNT (for badge)
// ---------------------------
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Message.countDocuments({
      receiver: userId,
      isRead: false,
    });

    return res.status(200).json({ unreadCount });

  } catch (err) {
    console.error("UNREAD COUNT ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};

// ---------------------------
// MARK ALL MESSAGES AS READ
// ---------------------------
exports.markChatAsRead = async (req, res) => {
  try {
    const { chatRoomId } = req.params;
    const userId = req.user.id;

    // 🔥 Validate user belongs to chat
    const chatRoom = await ChatRoom.findOne({
      _id: chatRoomId,
      participants: userId,
    }).select("_id");

    if (!chatRoom) {
      return res.status(403).json({ message: "Access denied" });
    }

    // 🔥 Update only necessary docs
    const result = await Message.updateMany(
      {
        chatRoom: chatRoomId,
        receiver: userId,
        isRead: false,
      },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      message: "Messages marked as read",
      updated: result.modifiedCount,
    });

  } catch (err) {
    console.error("MARK READ ERROR:", err);
    return res.status(500).json({ message: "Server Error" });
  }
};


exports.sendVoiceMessage = async (req, res) => {
  try {
    const { chatRoomId, receiverId, duration } = req.body;
    const senderId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: "Audio file required" });
    }

    // 🔥 Validate chat access
    const chatRoom = await ChatRoom.findOne({
      _id: chatRoomId,
      participants: senderId,
    }).select("_id");

    if (!chatRoom) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // 🔥 Upload (still sync, queue later for 10/10)
    const upload = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: "chat_audios",
    });

    // 🔥 Create message
    const message = await Message.create({
      chatRoom: chatRoomId,
      sender: senderId,
      receiver: receiverId,
      messageType: "audio",
      audioUrl: upload.secure_url,
      audioDuration: duration,
    });

    // 🔥 Fast update (no doc load)
    await ChatRoom.updateOne(
      { _id: chatRoomId },
      {
        $set: {
          lastMessage: "🎤 Voice message",
          lastMessageAt: new Date(),
        },
      }
    );

    return res.status(201).json({
      success: true,
      message,
    });

  } catch (error) {
    console.error("VOICE ERROR:", error);
    return res.status(500).json({ message: "Voice message failed" });
  }
};


  // ---------------------------
// DELETE MESSAGE (TEXT / VOICE)
// ---------------------------
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteForEveryone } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId)
      .select("sender deletedFor")
      .lean();

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // 🔥 DELETE FOR EVERYONE
    if (deleteForEveryone) {
      if (message.sender.toString() !== userId) {
        return res.status(403).json({
          message: "Only sender can delete for everyone",
        });
      }

      await Message.updateOne(
        { _id: messageId },
        { $set: { isDeletedForEveryone: true } }
      );

      return res.status(200).json({
        success: true,
        message: "Deleted for everyone",
      });
    }

    // 🔥 DELETE FOR ME (atomic)
    await Message.updateOne(
      { _id: messageId },
      { $addToSet: { deletedFor: userId } }
    );

    return res.status(200).json({
      success: true,
      message: "Deleted for you",
    });

  } catch (error) {
    console.error("DELETE MESSAGE ERROR:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};
