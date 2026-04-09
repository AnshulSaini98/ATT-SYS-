require("dotenv").config();

const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const routes = require("./routes");
const { connectDatabase } = require("./config");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;
// CORS configurationconst defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5001",
  "http://127.0.0.1:5001",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const envAllowedOrigins = String(process.env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

// Middleware
app.disable("x-powered-by");
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser clients and same-origin requests with no Origin header.
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many login attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const attendanceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 requests per minute
  message: "Too many attendance requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters (relaxed during development to avoid lockouts)
const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  app.post("/login", loginLimiter);
  app.post("/mark-attendance", attendanceLimiter);
}

app.get("/", (req, res) => {
  res.status(200).json({ message: "Smart QR Attendance API is running." });
});

app.use(routes);

// 404 fallback for unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// Centralized error handler (must be after all routes).
app.use(errorHandler);

const startServer = async () => {
  try {
    // Validate JWT_SECRET is configured
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured in .env file");
    }

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is not configured in .env file");
    }

    await connectDatabase(process.env.MONGODB_URI);

    app.listen(PORT, () => {
      // Server is running
    });
  } catch (error) {
    console.error("Server startup error:", error.message);
    process.exit(1);
  }
};

startServer();

// Safety: avoid crashing on unhandled promise rejections.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

module.exports = app;
