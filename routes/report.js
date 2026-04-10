const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const Student = require('../models/Student');
const ExamResult = require('../models/ExamResult');

router.get('/report/:studentId', async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    const result = await ExamResult.findOne({ studentId: req.params.studentId });

    if (!student || !result) {
      return res.status(404).json({ message: 'Student or result not found' });
    }

    // Create PDF doc
    const doc = new PDFDocument();

    // Set PDF headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=report_card.pdf');
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Report Card', { align: 'center' });
    doc.moveDown();

    // Student Info
    doc.fontSize(12).text(`Name: ${student.name}`);
    doc.text(`Class: ${student.class}`);
    doc.text(`Roll Number: ${student.rollNumber}`);
    doc.text(`Section: ${student.section}`);
    doc.moveDown();

    // Results Table
    doc.fontSize(14).text('Subjects & Marks', { underline: true });
    doc.moveDown(0.5);

    result.subjects.forEach((subj, index) => {
      doc.fontSize(12).text(`${index + 1}. ${subj.name}: ${subj.marksObtained} / ${subj.totalMarks}`);
    });

    doc.moveDown();
    doc.fontSize(12).text(`Total Obtained: ${result.totalObtained}`);
    doc.text(`Total Marks: ${result.totalMarks}`);
    doc.text(`Percentage: ${result.percentage}%`);
    doc.text(`Grade: ${result.grade}`);

    // Finalize PDF
    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;