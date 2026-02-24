const express = require("express");
const authRoutes = require("./authRoutes");
const sessionRoutes = require("./sessionRoutes");
const attendanceRoutes = require("./attendanceRoutes");

const router = express.Router();

router.use(authRoutes);
router.use(sessionRoutes);
router.use(attendanceRoutes);

module.exports = router;
