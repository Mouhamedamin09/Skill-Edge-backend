import express from "express";
import { authenticate } from "../middleware/auth";
import User from "../models/User";

const router = express.Router();

// Get current usage/subscription summary for authenticated user
router.get("/me", authenticate, async (req, res) => {
  try {
    const userId = (req.user as any)?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const isUnlimited =
      user.subscription.plan === "pro+" || user.subscription.minutesLeft === -1;

    return res.json({
      success: true,
      plan: user.subscription.plan,
      minutesLeft: isUnlimited
        ? -1
        : Math.max(0, user.subscription.minutesLeft || 0),
      isUnlimited,
      usage: user.usage,
    });
  } catch (error) {
    console.error("Usage summary error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

// Consume recording time (in seconds)
router.post("/consume", authenticate, async (req, res) => {
  try {
    const userId = (req.user as any)?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { seconds } = req.body || {};
    if (seconds == null || isNaN(seconds) || seconds < 0) {
      return res
        .status(400)
        .json({ success: false, error: "Valid seconds are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Unlimited plan: do not decrement
    const isUnlimited =
      user.subscription.plan === "pro+" || user.subscription.minutesLeft === -1;
    const consumedMinutes = Math.ceil(seconds / 60);

    if (!isUnlimited) {
      const currentLeft = Math.max(0, user.subscription.minutesLeft || 0);
      const newLeft = Math.max(0, currentLeft - consumedMinutes);
      user.subscription.minutesLeft = newLeft;
      user.usage.totalMinutesUsed =
        (user.usage.totalMinutesUsed || 0) + consumedMinutes;
      user.usage.lastInterviewDate = new Date();

      if (newLeft === 0) {
        user.subscription.status = "inactive";
      }

      await user.save();
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        subscription: user.subscription,
        usage: user.usage,
      },
      consumedMinutes,
      isUnlimited,
    });
  } catch (error) {
    console.error("Usage consume error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

// Top-up Pro plan: grant another 180 minutes if within active period
router.post("/topup-pro", authenticate, async (req, res) => {
  try {
    const userId = (req.user as any)?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const now = new Date();
    const isPro = user.subscription.plan === "pro";
    const isActiveWindow =
      !!user.subscription.endDate && new Date(user.subscription.endDate) > now;

    if (!isPro) {
      return res
        .status(400)
        .json({ success: false, error: "Top-up available only for Pro plan" });
    }
    if (!isActiveWindow) {
      return res
        .status(400)
        .json({ success: false, error: "Subscription period ended" });
    }

    // Only allow top-up when minutes are depleted
    const currentLeft = Number(user.subscription.minutesLeft || 0);
    if (currentLeft > 0) {
      return res
        .status(400)
        .json({ success: false, error: "Minutes are not yet depleted" });
    }

    user.subscription.minutesLeft = 180; // grant 3 hours
    await user.save();

    return res.json({
      success: true,
      message: "Pro minutes topped up by 3 hours",
      subscription: user.subscription,
      usage: user.usage,
    });
  } catch (error) {
    console.error("Usage topup error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
});

export default router;
