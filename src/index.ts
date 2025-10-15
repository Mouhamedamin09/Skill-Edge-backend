import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import passport from "passport";
import dotenv from "dotenv";

// Load environment variables first
dotenv.config();

// Import database connection after env vars are loaded
import connectDB from "./config/database";
// import "./config/passport";

// Import routes
import authRoutes from "./routes/auth";
import verificationRoutes from "./routes/verification";
import subscriptionCodeRoutes from "./routes/subscriptionCodes";
import usageRoutes from "./routes/usage";
// import googleAuthRoutes from "./routes/googleAuth";
import testRoutes from "./routes/test";
import aiRoutes from "./routes/ai";

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow localhost and file origins for development
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        "https://skilledge-sz5fb.ondigitalocean.app",
        process.env.CLIENT_URL,
        "file://",
        "null",
      ].filter(Boolean); // Remove any undefined values

      if (allowedOrigins.includes(origin) || origin.startsWith("file://")) {
        return callback(null, true);
      }

      // In production, you might want to be more restrictive
      if (process.env.NODE_ENV === "production") {
        const allowedProductionOrigins = [
          process.env.CLIENT_URL,
          process.env.ADMIN_URL,
        ].filter(Boolean);

        if (allowedProductionOrigins.includes(origin)) {
          return callback(null, true);
        }
      } else {
        // In development, allow all origins
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan("combined"));

// Passport middleware
// app.use(passport.initialize());

// Routes
app.use("/api/auth", authRoutes);
// app.use("/api/auth", googleAuthRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/subscription-codes", subscriptionCodeRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/test", testRoutes);
app.use("/api/ai", aiRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);

    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(statusCode).json({
      message,
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
);

// Start server
const startServer = async () => {
  try {
    // Connect to database first
    await connectDB();

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(
        `📧 Email service: ${
          process.env.AUTH_EMAIL ? "Configured" : "Not configured"
        }`
      );
      console.log(
        `🔐 Google OAuth: ${
          process.env.GOOGLE_CLIENT_ID ? "Configured" : "Not configured"
        }`
      );
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

export default app;
