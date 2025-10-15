import express, { Request, Response } from "express";
import { sendTestEmail } from "../config/email";

const router = express.Router();

// Test email endpoint
router.post("/email", async (req: Request, res: Response) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ message: "Email address is required" });
    }

    const result = await sendTestEmail(to);

    if (result.success) {
      return res.json({ message: "Test email sent successfully" });
    } else {
      return res.status(500).json({
        message: "Failed to send test email",
        error: result.error,
      });
    }
  } catch (error: any) {
    console.error("Test email error:", error);
    return res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Health check endpoint
router.get("/health", (req: Request, res: Response) => {
  return res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

export default router;
