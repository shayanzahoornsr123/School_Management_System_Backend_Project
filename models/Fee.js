const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    paidAt: { type: Date, default: Date.now },
    method: { type: String, default: "Manual" },
    txRef: { type: String },
    proofImage: { type: String },
  },
  { _id: false } // 🔥 reduces document size
);

const feeSchema = new mongoose.Schema(
  {
    // 🎯 Student reference
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // used in almost every query
    },

    // 🏫 School isolation (MULTI-TENANT SCALING)
    schoolName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // 📚 Class grouping (for admin dashboards)
    className: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    section: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    rollNumber: {
      type: String,
      trim: true,
    },

    // 💰 Fee details
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    dueDate: {
      type: Date,
      required: true,
      index: true, // 🔥 for due-date sorting/filtering
    },

    issuedDate: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["Pending", "PartiallyPaid", "Paid", "Unpaid"],
      default: "Pending",
      index: true, // 🔥 dashboards (paid/unpaid stats)
    },

    // 👀 Read tracking
    isRead: {
      type: Boolean,
      default: false,
      index: true, // 🔥 unread count
    },

    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // 📷 Payment history (embedded, optimized)
    paymentHistory: {
      type: [paymentSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false, // cleaner documents
  }
);

/* ======================================================
   🔥🔥🔥 CRITICAL INDEXES (REAL SCALABILITY)
====================================================== */

// 🔥 1. Student + School (MOST USED QUERY)
feeSchema.index({ studentId: 1, schoolName: 1 });

// 🔥 2. Class dashboard queries
feeSchema.index({ className: 1, section: 1, schoolName: 1 });

// 🔥 3. Unread notifications
feeSchema.index({ studentId: 1, isRead: 1 });

// 🔥 4. Payment filtering (admin dashboards)
feeSchema.index({ schoolName: 1, status: 1 });

// 🔥 5. Due date tracking (important for reminders)
feeSchema.index({ schoolName: 1, dueDate: 1 });

// 🔥 6. Sorting optimization
feeSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.Fee || mongoose.model("Fee", feeSchema);