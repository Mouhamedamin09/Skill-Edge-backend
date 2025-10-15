import express, { Request, Response } from "express";
import passport from "passport";
import { generateToken } from "../utils/jwt";

const router = express.Router();

// Google OAuth login
router.get("/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      message:
        "Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.",
    });
  }
  return passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res);
});

// Google OAuth callback
router.get(
  "/google/callback",
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(
        `${process.env.CLIENT_URL}/login?error=google_oauth_not_configured`
      );
    }
    passport.authenticate("google", {
      failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed`,
    })(req, res, next);
  },
  (req: Request, res: Response) => {
    try {
      const user = req.user as any;

      if (!user) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=user_not_found`
        );
      }

      // Generate JWT token
      const token = generateToken({
        userId: user._id.toString(),
        email: user.email,
      });

      // Redirect to frontend with token
      res.redirect(
        `${process.env.CLIENT_URL}/auth/callback?token=${token}&success=true`
      );
    } catch (error) {
      console.error("Google OAuth callback error:", error);
      res.redirect(`${process.env.CLIENT_URL}/login?error=server_error`);
    }
  }
);

// Google OAuth logout
router.post("/google/logout", (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ message: "Logout failed" });
    }
    return res.json({ message: "Logged out successfully" });
  });
});

export default router;
