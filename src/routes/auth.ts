import express, { Request, Response } from "express";
import User from "../models/User";
import EmailVerification from "../models/EmailVerification";
import { generateToken } from "../utils/jwt";
import { sendVerificationEmail } from "../config/email";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = express.Router();

// Register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email" });
    }

    // Create user
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      isEmailVerified: false,
    });

    await user.save();

    // Create email verification
    const verification = await EmailVerification.createVerification(email);

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verification.code);

    if (!emailResult.success) {
      // If email fails, log the code for development
      console.log(`Verification code for ${email}: ${verification.code}`);
    }

    return res.status(201).json({
      message: emailResult.success
        ? "User created successfully. Please check your email for verification."
        : "User created successfully. Check console for verification code.",
      requiresVerification: true,
      email: user.email,
      verificationCode: emailResult.success ? undefined : verification.code,
    });
  } catch (error: any) {
    console.error("Registration error:", error);
    return res.status(500).json({
      message: "Server error during registration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in",
        requiresVerification: true,
        email: user.email,
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate token
    const token = generateToken({
      userId: (user._id as any).toString(),
      email: user.email,
    });

    return res.json({
      message: "Login successful",
      token,
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
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Server error during login",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Get current user
router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    return res.json({
      user: {
        id: req.user!._id,
        firstName: req.user!.firstName,
        lastName: req.user!.lastName,
        email: req.user!.email,
        isEmailVerified: req.user!.isEmailVerified,
        subscription: req.user!.subscription,
        usage: req.user!.usage,
        preferences: req.user!.preferences,
      },
    });
  } catch (error: any) {
    console.error("Get user error:", error);
    return res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Update profile
router.put(
  "/profile",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { firstName, lastName, preferences } = req.body;
      const userId = req.user!._id;

      const updateData: any = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (preferences)
        updateData.preferences = { ...req.user!.preferences, ...preferences };

      const user = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      return res.json({
        message: "Profile updated successfully",
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
      console.error("Update profile error:", error);
      return res.status(500).json({
        message: "Server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Change password
router.put(
  "/change-password",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!._id;

      // Get user with password
      const user = await User.findById(userId).select("+password");
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(
        currentPassword
      );
      if (!isCurrentPasswordValid) {
        return res
          .status(400)
          .json({ message: "Current password is incorrect" });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      return res.json({ message: "Password changed successfully" });
    } catch (error: any) {
      console.error("Change password error:", error);
      return res.status(500).json({
        message: "Server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Update user usage (minutes consumed) - v2
router.post(
  "/update-usage",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { minutesUsed } = req.body;

      if (!minutesUsed || minutesUsed < 0) {
        return res.status(400).json({ message: "Invalid minutes used" });
      }

      const user = await User.findById(req.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update total minutes used
      user.usage.totalMinutesUsed =
        (user.usage.totalMinutesUsed || 0) + minutesUsed;

      // Update minutes left (subtract from remaining)
      if (user.subscription.minutesLeft > 0) {
        user.subscription.minutesLeft = Math.max(
          0,
          user.subscription.minutesLeft - minutesUsed
        );
      }

      await user.save();

      return res.json({
        message: "Usage updated successfully",
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          subscription: user.subscription,
          usage: user.usage,
        },
      });
    } catch (error: any) {
      console.error("Update usage error:", error);
      return res.status(500).json({
        message: "Server error",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

export default router;
