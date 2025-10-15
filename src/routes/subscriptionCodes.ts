import express from "express";
import { authenticate } from "../middleware/auth";
import SubscriptionCode from "../models/SubscriptionCode";
import User from "../models/User";
import { SubscriptionCodeGenerator } from "../utils/codeGenerator";

const router = express.Router();

/**
 * Validate a subscription code
 * POST /api/subscription-codes/validate
 */
router.post("/validate", async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Code is required",
      });
    }

    // First validate format
    const formatValidation = SubscriptionCodeGenerator.validateCodeFormat(code);
    if (!formatValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: formatValidation.error,
      });
    }

    // Check if code exists in database
    const subscriptionCode = await SubscriptionCode.findOne({
      code: code.trim().toUpperCase(),
    });

    if (!subscriptionCode) {
      return res.status(404).json({
        success: false,
        error: "Invalid code. Please check and try again.",
      });
    }

    // Check if code is already used
    if (subscriptionCode.isUsed) {
      return res.status(400).json({
        success: false,
        error: "This code has already been used.",
      });
    }

    // Check if code has expired
    if (new Date() > subscriptionCode.expiresAt) {
      return res.status(400).json({
        success: false,
        error: "This code has expired.",
      });
    }

    // Code is valid
    return res.json({
      success: true,
      planType: subscriptionCode.planType,
      expiresAt: subscriptionCode.expiresAt,
      message: "Code is valid and ready to redeem!",
    });
  } catch (error) {
    console.error("Code validation error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during validation",
    });
  }
});

/**
 * Redeem a subscription code
 * POST /api/subscription-codes/redeem
 */
router.post("/redeem", authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = (req.user as any)?._id;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Code is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    // Find the code
    const subscriptionCode = await SubscriptionCode.findOne({
      code: code.trim().toUpperCase(),
    });

    if (!subscriptionCode) {
      return res.status(404).json({
        success: false,
        error: "Invalid code. Please check and try again.",
      });
    }

    // Check if code is already used
    if (subscriptionCode.isUsed) {
      return res.status(400).json({
        success: false,
        error: "This code has already been used.",
      });
    }

    // Check if code has expired
    if (new Date() > subscriptionCode.expiresAt) {
      return res.status(400).json({
        success: false,
        error: "This code has expired.",
      });
    }

    // Get user and update subscription
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Update user subscription with cumulative logic for Pro; upgrade for Pro+
    user.subscription.status = "active";
    user.subscription.startDate = new Date();

    if (subscriptionCode.planType === "pro") {
      const now = new Date();
      const isCurrentlyPro = user.subscription.plan === "pro";
      const isActivePeriod =
        !!user.subscription.endDate &&
        new Date(user.subscription.endDate) > now;

      if (isCurrentlyPro && isActivePeriod) {
        // Top-up minutes cumulatively
        const currentLeft =
          user.subscription.minutesLeft === -1
            ? 0
            : Number(user.subscription.minutesLeft || 0);
        user.subscription.minutesLeft = currentLeft + 180; // add 3 hours
        user.subscription.tokens = 100;
        // Keep existing endDate
      } else {
        // Start new/renewed 2-month Pro window
        user.subscription.plan = "pro";
        const end = new Date();
        end.setMonth(end.getMonth() + 2);
        user.subscription.endDate = end;
        user.subscription.tokens = 100;
        user.subscription.minutesLeft = 180;
      }
    } else if (subscriptionCode.planType === "pro+") {
      user.subscription.plan = "pro+";
      user.subscription.tokens = 1000;
      user.subscription.minutesLeft = -1; // unlimited
      user.subscription.endDate = subscriptionCode.expiresAt;
    }

    await user.save();

    // Mark code as used
    subscriptionCode.isUsed = true;
    subscriptionCode.usedBy = user._id as any;
    subscriptionCode.usedAt = new Date();
    await subscriptionCode.save();

    return res.json({
      success: true,
      message: `Successfully activated ${subscriptionCode.planType.toUpperCase()} plan!`,
      planType: subscriptionCode.planType,
      expiresAt: subscriptionCode.expiresAt,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        subscription: user.subscription,
        usage: user.usage,
      },
    });
  } catch (error) {
    console.error("Code redemption error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during redemption",
    });
  }
});

/**
 * Generate subscription codes (Admin only)
 * POST /api/subscription-codes/generate
 */
router.post("/generate", async (req, res) => {
  try {
    const { planType, count = 1, adminId, customPrefix } = req.body;

    if (!planType || !["pro", "pro+"].includes(planType)) {
      return res.status(400).json({
        success: false,
        error: "Valid plan type is required (pro or pro+)",
      });
    }

    if (!adminId) {
      return res.status(400).json({
        success: false,
        error: "Admin ID is required",
      });
    }

    if (count < 1 || count > 100) {
      return res.status(400).json({
        success: false,
        error: "Count must be between 1 and 100",
      });
    }

    // Generate codes
    const generatedCodes = SubscriptionCodeGenerator.generateMultipleCodes(
      planType,
      adminId,
      count
    );

    // Save codes to database
    const codesToSave = generatedCodes.map((codeData) => ({
      code: codeData.code,
      planType: codeData.planType,
      expiresAt: codeData.expiresAt,
      generatedBy: codeData.generatedBy,
    }));

    const savedCodes = await SubscriptionCode.insertMany(codesToSave);

    return res.json({
      success: true,
      message: `Successfully generated ${
        savedCodes.length
      } ${planType.toUpperCase()} codes`,
      codes: savedCodes.map((code) => ({
        id: code._id,
        code: code.code,
        planType: code.planType,
        expiresAt: code.expiresAt,
        createdAt: code.createdAt,
      })),
    });
  } catch (error) {
    console.error("Code generation error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during code generation",
    });
  }
});

/**
 * Get code statistics (Admin only)
 * GET /api/subscription-codes/stats
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await SubscriptionCode.aggregate([
      {
        $group: {
          _id: "$planType",
          total: { $sum: 1 },
          used: { $sum: { $cond: ["$isUsed", 1, 0] } },
          unused: { $sum: { $cond: ["$isUsed", 0, 1] } },
          expired: {
            $sum: {
              $cond: [{ $gt: ["$expiresAt", new Date()] }, 0, 1],
            },
          },
        },
      },
    ]);

    const totalStats = await SubscriptionCode.aggregate([
      {
        $group: {
          _id: null,
          totalCodes: { $sum: 1 },
          totalUsed: { $sum: { $cond: ["$isUsed", 1, 0] } },
          totalUnused: { $sum: { $cond: ["$isUsed", 0, 1] } },
        },
      },
    ]);

    return res.json({
      success: true,
      stats: stats,
      total: totalStats[0] || { totalCodes: 0, totalUsed: 0, totalUnused: 0 },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error while fetching stats",
    });
  }
});

export default router;
