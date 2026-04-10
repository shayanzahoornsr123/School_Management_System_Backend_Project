const express = require('express');
const router = express.Router();
const User = require('../models/User');

// ✅ Link student to parent by parentId
router.put('/link-child/:parentId', async (req, res) => {
  try {
    const { studentId } = req.body;

    const user = await User.findByIdAndUpdate(
      req.params.parentId,
      { linkedStudentId: studentId },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: 'Parent not found' });

    res.json({ message: 'Linked student to parent', user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
