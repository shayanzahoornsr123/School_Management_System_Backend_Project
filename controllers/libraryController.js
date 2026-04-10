const { Book, BorrowRecord } = require('../models/Library');
const cloudinary = require('../utils/cloudinary');
const mongoose = require('mongoose');

// =============================
// ⚙️ Config & Helpers
// =============================

const parseTags = (tags) => {
  if (!tags) return [];
  return Array.isArray(tags)
    ? tags
    : String(tags)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
};

const computeStatus = (record) => {
  if (record.returnedAt) return 'returned';
  return new Date() > record.dueAt ? 'overdue' : 'borrowed';
};

const uploadCover = async (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'library_covers', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(fileBuffer);
  });
};

// =============================
// 📘 BOOK MANAGEMENT
// =============================

// ➕ Create Book (Admin/Teacher)
exports.createBook = async (req, res) => {
  try {
    const { title, author, isbn, subject, category, totalCopies, className, section, tags } = req.body;

    if (!title || !author || totalCopies === undefined) {
      return res.status(400).json({ message: 'title, author, totalCopies are required' });
    }

    let coverMeta = {};
    if (req.file && req.file.buffer) {
      const uploaded = await uploadCover(req.file.buffer);
      coverMeta = { coverUrl: uploaded.secure_url, coverPublicId: uploaded.public_id };
    }

    const book = await Book.create({
      title,
      author,
      isbn,
      subject,
      category,
      className: className || null,
      section: section || null,
      tags: parseTags(tags),
      totalCopies: Number(totalCopies),
      availableCopies: Number(totalCopies),
      createdBy: req.user?._id,
      schoolName: req.user.schoolName,
      ...coverMeta,
    });

    res.status(201).json({ message: '✅ Book created', book });
  } catch (err) {
    console.error('❌ createBook', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
};


// 📄 Get All Books (WITH PAGINATION)
exports.getBooks = async (req, res) => {
  try {
    const {
      q,
      subject,
      category,
      author,
      className,
      section,
      available,
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(parseInt(limit), 50);
    const skip = (pageNum - 1) * limitNum;

    const filter = { schoolName: req.user.schoolName };

    // 🔍 Search
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { author: { $regex: q, $options: "i" } },
        { isbn: { $regex: q, $options: "i" } },
        { subject: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { tags: { $elemMatch: { $regex: q, $options: "i" } } },
      ];
    }

    // 📚 Filters
    if (subject) filter.subject = subject;
    if (category) filter.category = category;
    if (author) filter.author = author;

    // 👨‍🎓 Student restriction
    if (req.user.role === "student") {
      if (!req.user.className || !req.user.section) {
        return res.status(400).json({
          message: "Student className/section not set",
        });
      }

      filter.$and = [
        { $or: [{ className: null }, { className: req.user.className }] },
        { $or: [{ section: null }, { section: req.user.section }] },
      ];
    } else {
      if (className) filter.className = className;
      if (section) filter.section = section;
    }

    // 📦 Availability
    if (available === "true") {
      filter.availableCopies = { $gt: 0 };
    }

    // ===============================
    // 🚀 PARALLEL QUERY (FAST)
    // ===============================
    const [items, total] = await Promise.all([
      Book.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),

      Book.countDocuments(filter),
    ]);

    // ===============================
    // 🚀 RESPONSE
    // ===============================
    res.json({
      items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum * limitNum < total,
        hasPrevPage: pageNum > 1,
      },
    });

  } catch (err) {
    console.error("❌ getBooks", err);
    res.status(500).json({
      message: err.message || "Server error",
    });
  }
};



// ✏️ Update Book
exports.updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID' });

    const book = await Book.findById(id);
    if (!book) return res.status(404).json({ message: 'Book not found' });

    if (book.schoolName !== req.user.schoolName) {
      return res.status(403).json({ message: 'Access denied for this school' });
    }

    if (req.file && req.file.buffer) {
      if (book.coverPublicId) {
        try {
          await cloudinary.uploader.destroy(book.coverPublicId, { resource_type: 'image' });
        } catch (e) {
          console.warn('⚠️ Cover delete failed:', e.message);
        }
      }
      const uploaded = await uploadCover(req.file.buffer);
      book.coverUrl = uploaded.secure_url;
      book.coverPublicId = uploaded.public_id;
    }

    const fields = ['title', 'author', 'isbn', 'subject', 'category', 'className', 'section', 'tags', 'availableCopies', 'totalCopies'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) book[f] = req.body[f];
    });

    if (req.body.tags) book.tags = parseTags(req.body.tags);

    if (req.body.totalCopies !== undefined) {
      const total = Number(req.body.totalCopies);
      const used = book.totalCopies - book.availableCopies;
      book.totalCopies = total;
      book.availableCopies = Math.max(0, total - used);
    }

    await book.save();
    res.json({ message: '✅ Book updated', book });
  } catch (err) {
    console.error('❌ updateBook', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
};


// 🗑️ Delete Book
exports.deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid ID' });
    }

    const book = await Book.findById(id);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    if (book.schoolName !== req.user.schoolName) {
      return res.status(403).json({ message: 'Access denied for this school' });
    }

    // ✅ Delete cover image from Cloudinary if exists
    if (book.coverPublicId) {
      try {
        await cloudinary.uploader.destroy(book.coverPublicId, { resource_type: 'image' });
      } catch (e) {
        console.warn('⚠️ Cover delete failed:', e.message);
      }
    }

    // Delete the book
    await Book.findByIdAndDelete(id);

    res.json({ message: '✅ Book deleted successfully' });
  } catch (err) {
    console.error('❌ deleteBook', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
};

