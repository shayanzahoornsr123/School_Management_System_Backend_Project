const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { verifyToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const User = require('../models/User');

// ✅ GET Profile by ID (any user can view own profile or admin can view any)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Only admin or owner can view
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ message: 'Access Denied' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ✅ UPDATE Profile by ID (owner or admin)
router.put('/update/:id', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { name, email, rollNumber, class: className, section, dob, password } = req.body;

    // Only owner or admin
    if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
      return res.status(403).json({ message: 'Access Denied' });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (rollNumber) updateData.rollNumber = rollNumber;
    if (className) updateData.class = className;
    if (section) updateData.section = section;
    if (dob) updateData.dob = dob;
    if (req.file) updateData.profileImage = req.file.path;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Profile updated successfully', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

