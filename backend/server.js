require("dotenv").config();

const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { connectDatabase } = require("./config");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ message: "Smart QR Attendance API is running." });
});

app.use(routes);

const startServer = async () => {
  try {
    await connectDatabase(process.env.MONGODB_URI);

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup error:", error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
