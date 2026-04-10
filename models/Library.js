const mongoose = require('mongoose');


/* ================================
   📚 Book Schema
===================================*/
const BookSchema = new mongoose.Schema(
  {
    // 🎯 Optional class targeting (if books are class-specific)
    className: { type: String, default: null },
    section: { type: String, default: null },
    schoolName: { type: String, required: true, trim: true },

    // 📝 Basic Info
    title: { type: String, required: true, trim: true },
    author: { type: String, required: true, trim: true },
    isbn: { type: String, trim: true },
    subject: { type: String, trim: true },
    category: { type: String, trim: true },
    tags: [{ type: String, trim: true }],

    // 📊 Inventory
    totalCopies: { type: Number, required: true, min: 0 },
    availableCopies: { type: Number, required: true, min: 0 },

    // 🖼️ Optional cover via Cloudinary
    coverUrl: { type: String, default: null },
    coverPublicId: { type: String, default: null },

    // 👤 Who created the book entry (e.g. Librarian/Admin)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

/* ================================
   ⚡ Indexes for fast text search
===================================*/
BookSchema.index({ title: 'text', author: 'text', subject: 'text', category: 'text', tags: 'text' });

/* ================================
   ✅ Model Export
===================================*/
const Book = mongoose.model('Book', BookSchema);

module.exports = { Book };