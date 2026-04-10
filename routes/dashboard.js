const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Student = require('../models/Student');
const Message = require('../models/Message');
const Notice = require('../models/Notice');
const Attendance = require('../models/Attendance');
const ExamResult = require('../models/ExamResult');
const Fee = require('../models/Fee');

router.get('/', verifyToken, async (req, res) => {
  const role = req.user.role;
  const userId = req.user.id;

  try {
    let dashboardData = {};

    if (role === 'admin') {
      dashboardData = {
        users: await User.countDocuments(),
        students: await Student.countDocuments(),
        teachers: await User.countDocuments({ role: 'teacher' }),
        messages: await Message.countDocuments()
      };
    }

    if (role === 'teacher') {
      dashboardData = {
        notices: await Notice.find({ audience: { $in: ['All', 'Teachers'] } }),
        exams: await ExamResult.find({}),
        messages: await Message.find({ senderId: userId })
      };
    }

    if (role === 'student') {
      dashboardData = {
        attendance: await Attendance.find({ studentId: userId }),
        results: await ExamResult.find({ studentId: userId }),
        fees: await Fee.find({ studentId: userId }),
        notices: await Notice.find({ audience: { $in: ['All', 'Students'] } })
      };
    }

    if (role === 'parent') {
      const parent = await User.findById(userId);
      const childId = parent.linkedStudentId;

      dashboardData = {
        notices: await Notice.find({ audience: { $in: ['All', 'Parents'] } }),
        messages: await Message.find({ receiverId: userId }),
        childAttendance: await Attendance.find({ studentId: childId }),
        childResults: await ExamResult.find({ studentId: childId }),
        childFees: await Fee.find({ studentId: childId }),
        childProfile: await Student.findById(childId)
      };
    }

    res.json({ role, dashboardData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;