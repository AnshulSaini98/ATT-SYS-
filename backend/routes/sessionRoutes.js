const express = require("express");
const { sessionController } = require("../controllers");

const router = express.Router();

router.post("/start-session", sessionController.startSession);
router.post("/end-session", sessionController.endSession);

module.exports = router;
