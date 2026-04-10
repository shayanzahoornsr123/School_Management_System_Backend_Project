const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');

// Upload file to Cloudinary
router.post('/file', upload.single('file'), (req, res) => {
  if (!req.file || !req.file.path) {
    return res.status(400).json({ error: 'File upload failed' });
  }

  res.status(200).json({
    message: 'Upload successful',
    fileUrl: req.file.path,
  });
});

module.exports = router;