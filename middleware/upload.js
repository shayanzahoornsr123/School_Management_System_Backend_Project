// middleware/upload.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../utils/cloudinary');
const path = require('path');

// Configure Cloudinary Storage
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
  const ext = path.extname(file.originalname).toLowerCase();

  const allowedExts = [
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg', '.heic', '.heif',
    '.pdf',
    '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt',
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.3gp',
  ];

  if (!allowedExts.includes(ext)) {
    throw new Error(`Invalid file type: ${ext}`);
  }

  const originalNameWithoutExt = path.parse(file.originalname).name;

  return {
    folder: 'school_management',
    resource_type: 'auto',
    public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}-${originalNameWithoutExt}`,
  };
},

});

// Multer middleware
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
});

module.exports = upload;
