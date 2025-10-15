import express, { Request, Response } from "express";
import User from "../models/User";
import EmailVerification from "../models/EmailVerification";
import { sendVerificationEmail } from "../config/email";
import { generateToken } from "../utils/jwt";

const router = express.Router();

// Verify email
router.post("/verify-email", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res
        .status(400)
        .json({ message: "Email and verification code are required" });
    }

    // Verify the code
    const isValid = await EmailVerification.verifyCode(email, code);

    if (!isValid) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification code" });
    }

    // Update user's email verification status
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isEmailVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate JWT token
    const token = generateToken({
      userId: (user._id as any).toString(),
      email: user.email,
    });

    return res.json({
      message: "Email verified successfully",
      token: token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        subscription: user.subscription,
        usage: user.usage,
        preferences: user.preferences,
      },
    });
  } catch (error: any) {
    console.error("Email verification error:", error);
    return res.status(500).json({
      message: "Server error during email verification",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Resend verification email
router.post("/resend-verification", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if user exists
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Create new verification
    const verification = await EmailVerification.createVerification(email);

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verification.code);

    if (!emailResult.success) {
      // If email fails, log the code for development
      console.log(`Verification code for ${email}: ${verification.code}`);
    }

    return res.json({
      message: emailResult.success
        ? "Verification email sent successfully"
        : "Check console for verification code",
      verificationCode: emailResult.success ? undefined : verification.code,
    });
  } catch (error: any) {
    console.error("Resend verification error:", error);
    return res.status(500).json({
      message: "Server error during resend verification",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

export default router;
