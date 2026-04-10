const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["admin", "teacher", "student", "parent"],
    required: true 
  },
  schoolName: { type: String, required: true },
  rollNumber: { type: String },
  className: { type: String },
  section: { type: String },
  dob: { type: Date },
  profileImage: { type: String },
  fcmToken: { type: String },
  profileImagePublicId: { type: String },

  isApproved: { type: Boolean, default: false },
  approvedAt: { type: Date },

  resetOTP: { type: String },
  resetOTPExpiry: { type: Date },
  
  lastSeen: {
  type: Date,
  default: null
 },

  children: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], 

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);










// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema({
//   name: { type: String, required: true },
//   email: { type: String, unique: true, required: true },
//   password: { type: String, required: true },

//   role: { 
//     type: String, 
//     enum: ["admin", "teacher", "student", "parent"],
//     required: true 
//   },

//   schoolName: { type: String, required: true },

//   dob: { type: Date },
//   profileImage: { type: String },
//   profileImagePublicId: { type: String },
//   fcmToken: { type: String },

//   isApproved: { type: Boolean, default: false },
//   approvedAt: { type: Date },

//   resetOTP: { type: String },
//   resetOTPExpiry: { type: Date },

//   lastSeen: {
//     type: Date,
//     default: null
//   },

//   // 👨‍👩‍👧 Parent → children
//   children: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

//   createdAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model("User", userSchema);