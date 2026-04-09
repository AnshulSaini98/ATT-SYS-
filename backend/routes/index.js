const express = require("express");
const authRoutes = require("./authRoutes");
const sessionRoutes = require("./sessionRoutes");
const attendanceRoutes = require("./attendanceRoutes");
const adminRoutes = require("./adminRoutes");

const router = express.Router();

router.use(authRoutes);
router.use(sessionRoutes);
router.use(attendanceRoutes);
router.use(adminRoutes);

module.exports = router;
