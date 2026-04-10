const multer = require("multer");

const storage = multer.diskStorage({});

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    const allowedTypes = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-wav", "audio/ogg", "audio/aac"];
    if (allowedTypes.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files allowed"), false);
    }
  },
});

module.exports = upload;