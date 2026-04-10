// ====================== IMPORTS ======================
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const Message = require("./models/Message");
const ChatRoom = require("./models/ChatRoom");
const User = require("./models/User");

// ====================== CONFIG ======================
dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// ====================== DB ======================
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// ====================== ROUTES ======================
app.get("/", (req, res) => {
  res.send("School Backend Running ✅");
});

// ----------------- API Routes -----------------
app.use("/api/upload", require("./routes/upload"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/timetable", require("./routes/timetable"));
app.use("/api/datesheets", require("./routes/dateSheetRoutes"));
app.use("/api/exams", require("./routes/exam"));
app.use("/api/fees", require("./routes/fee"));
app.use("/api/assignments", require("./routes/assignment"));
app.use("/api/notices", require("./routes/notice"));
app.use("/api/study-materials", require("./routes/studyMaterialRoutes"));
app.use("/api/library", require("./routes/libraryRoutes"));
app.use("/api/users", require("./routes/users"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
const chatRoutes = require("./routes/chatRoutes");
app.use("/api/chat", chatRoutes);

// ====================== SOCKET.IO ======================
const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔥 Track Online Users
const onlineUsers = {};

// ====================== SOCKET CONNECTION ======================
io.on("connection", (socket) => {

  console.log("🟢 Connected:", socket.id);

  // ================= USER ONLINE =================
  socket.on("user-online", async ({ userId }) => {

    onlineUsers[userId] = socket.id;

    await User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date()
    });

    io.emit("online-users", Object.keys(onlineUsers));
  });

  // ================= JOIN CHAT =================
  socket.on("join-chat", ({ chatRoomId }) => {
    socket.join(chatRoomId);
    console.log("💬 Joined:", chatRoomId);
  });

  // ================= SEND MESSAGE =================
  socket.on("send-message", async (data) => {

    try {

      const {
        chatRoomId,
        senderId,
        receiverId,
        text,
        attachments,
        audioUrl
      } = data;

      const message = await Message.create({
        chatRoom: chatRoomId,
        sender: senderId,
        receiver: receiverId,
        text,
        audioUrl,
        attachments: attachments || [],
        isRead: false,
        deletedFor: []
      });

      await ChatRoom.findByIdAndUpdate(chatRoomId, {
        lastMessage: text
          ? text
          : audioUrl
          ? "🎤 Voice Message"
          : "📎 Attachment",
        lastMessageAt: new Date()
      });

      // 🔥 EMIT REALTIME MESSAGE
      io.to(chatRoomId).emit("receive-message", message);

      // 🔥 EMIT CHAT LIST UPDATE
      io.to(chatRoomId).emit("chat-updated", {
        chatRoomId,
        lastMessage: message.text || "Media",
        lastMessageAt: new Date()
      });

    } catch (err) {
      console.error("❌ send-message error:", err);
    }
  });

  // ================= DELETE FOR ME =================
  socket.on("delete-for-me", async ({ messageId, userId, chatRoomId }) => {

    await Message.findByIdAndUpdate(messageId, {
      $addToSet: { deletedFor: userId }
    });

    io.to(chatRoomId).emit("message-deleted-for-me", {
      messageId,
      userId
    });
  });

  // ================= DELETE FOR EVERYONE =================
  socket.on("delete-for-everyone", async ({ messageId, chatRoomId }) => {

    await Message.findByIdAndUpdate(messageId, {
      isDeleted: true
    });

    io.to(chatRoomId).emit("message-deleted", {
      messageId
    });
  });

  // ================= TYPING =================
  socket.on("typing", ({ chatRoomId, senderId }) => {
    socket.to(chatRoomId).emit("typing", { senderId });
  });

  socket.on("stop-typing", ({ chatRoomId, senderId }) => {
    socket.to(chatRoomId).emit("stop-typing", { senderId });
  });

  // ================= READ RECEIPT =================
  socket.on("mark-read", async ({ chatRoomId, userId }) => {

    await Message.updateMany(
      { chatRoom: chatRoomId, receiver: userId, isRead: false },
      { $set: { isRead: true } }
    );

    io.to(chatRoomId).emit("messages-read", {
      chatRoomId,
      userId
    });
  });

  // ================= DISCONNECT =================
  socket.on("disconnect", async () => {

    const userId = Object.keys(onlineUsers).find(
      id => onlineUsers[id] === socket.id
    );

    if (userId) {

      delete onlineUsers[userId];

      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date()
      });

      io.emit("user-offline", { userId });
    }

    console.log("🔴 Disconnected:", socket.id);
  });

});

// ====================== SERVER ======================
const PORT = process.env.PORT || 5050;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});






