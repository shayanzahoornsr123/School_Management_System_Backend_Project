const express = require('express');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const controller = require('../controllers/timetableController');
const router = express.Router();

// Create (admin/teacher)
router.post('/', verifyToken, authorizeRoles('admin','teacher'), controller.createTimeTable);

// Get all (admin/teacher)
router.get('/', verifyToken, authorizeRoles('admin','teacher'), controller.getAllTimeTables);

// Get class timetable — allow student/teacher/admin
router.get('/class', verifyToken, authorizeRoles('student','parent','teacher','admin'), controller.getClassTimeTable);

// Update (admin/teacher)
router.put('/:id', verifyToken, authorizeRoles('admin','teacher'), controller.updateTimeTable);

// Delete (admin/teacher)
router.delete('/:id', verifyToken, authorizeRoles('admin','teacher'), controller.deleteTimeTable);

module.exports = router;
