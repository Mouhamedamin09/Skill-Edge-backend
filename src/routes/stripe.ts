import express, { Request, Response } from "express";
import Stripe from "stripe";
import { authenticate } from "../middleware/auth";
import User from "../models/User";

const router = express.Router();

// Initialize Stripe with your secret key (only if key is provided)
let stripe: Stripe | null = null;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-09-30.clover",
  });
} else {
  console.warn(
    "⚠️  STRIPE_SECRET_KEY not configured. Stripe payment routes will return 503."
  );
}

// Price IDs for each plan (you'll need to create these in Stripe Dashboard)
const STRIPE_PRICE_IDS = {
  pro: process.env.STRIPE_PRO_PRICE_ID || "price_pro_monthly",
  "pro+": process.env.STRIPE_PRO_PLUS_PRICE_ID || "price_proplus_monthly",
  test: process.env.STRIPE_TEST_PRICE_ID || "price_test", // LOCAL TESTING ONLY
};

// Validate Price IDs on startup
if (process.env.STRIPE_SECRET_KEY) {
  if (!process.env.STRIPE_PRO_PRICE_ID?.startsWith("price_")) {
    console.warn(
      `⚠️  STRIPE_PRO_PRICE_ID should start with "price_" (got: ${process.env.STRIPE_PRO_PRICE_ID})`
    );
  }
  if (!process.env.STRIPE_PRO_PLUS_PRICE_ID?.startsWith("price_")) {
    console.warn(
      `⚠️  STRIPE_PRO_PLUS_PRICE_ID should start with "price_" (got: ${process.env.STRIPE_PRO_PLUS_PRICE_ID})`
    );
  }
}

// Middleware to check if Stripe is configured
const requireStripe = (
  req: Request,
  res: Response,
  next: express.NextFunction
) => {
  if (!stripe) {
    res.status(503).json({
      success: false,
      error: "Payment system is not configured. Please contact support.",
    });
    return;
  }
  next();
};

/**
 * Create Stripe Checkout Session
 * POST /api/stripe/create-checkout-session
 */
router.post(
  "/create-checkout-session",
  authenticate,
  requireStripe,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req.user as any)?._id;
      const { planId } = req.body;

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      if (!planId || !["pro", "pro+", "test"].includes(planId)) {
        res
          .status(400)
          .json({ success: false, error: "Invalid plan selected" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      // Get or create Stripe customer
      let customerId = user.subscription.stripeCustomerId;

      // Verify customer exists in current Stripe mode (test vs live)
      if (customerId) {
        try {
          await stripe!.customers.retrieve(customerId);
        } catch (error: any) {
          // Customer doesn't exist in this mode (e.g., test customer in live mode)
          console.log(
            `Customer ${customerId} not found in current Stripe mode, creating new customer`
          );
          customerId = ""; // Reset to create new customer
        }
      }

      if (!customerId) {
        const customer = await stripe!.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: userId.toString(),
          },
        });
        customerId = customer.id;
        user.subscription.stripeCustomerId = customerId;
        await user.save();
        console.log(`Created new Stripe customer: ${customerId}`);
      }

      const priceId = STRIPE_PRICE_IDS[planId as "pro" | "pro+"];
      const clientUrl =
        process.env.CLIENT_URL || "https://skilledge-sz5fb.ondigitalocean.app";

      // Validate Price ID
      if (!priceId || !priceId.startsWith("price_")) {
        console.error(`Invalid Price ID: ${priceId}. Must start with "price_"`);
        res.status(500).json({
          success: false,
          error:
            "Payment system misconfigured. Please contact support. (Invalid Price ID)",
        });
        return;
      }

      console.log("Creating Stripe checkout session:", {
        planId,
        priceId,
        clientUrl,
        customerId,
      });

      // Create Checkout Session
      const session = await stripe!.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${clientUrl}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/dashboard/billing?canceled=true`,
        metadata: {
          userId: userId.toString(),
          planId: planId,
        },
      });

      res.json({
        success: true,
        sessionId: session.id,
        url: session.url,
      });
    } catch (error: any) {
      console.error("Stripe checkout error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create checkout session",
        details: error.message,
      });
    }
  }
);

/**
 * Create Payment Link for Cash Payment (QR Code)
 * POST /api/stripe/create-payment-link
 * CRITICAL: Must create/link Stripe Customer for webhook to work!
 */
router.post(
  "/create-payment-link",
  authenticate,
  requireStripe,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req.user as any)?._id;
      const { planId } = req.body;

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      if (!planId || !["pro", "pro+", "test"].includes(planId)) {
        res
          .status(400)
          .json({ success: false, error: "Invalid plan selected" });
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      // CRITICAL: Get or create Stripe customer (needed for webhook to identify user!)
      let customerId = user.subscription.stripeCustomerId;

      // Verify customer exists in current Stripe mode
      if (customerId) {
        try {
          await stripe!.customers.retrieve(customerId);
        } catch (error: any) {
          console.log(
            `Customer ${customerId} not found in current Stripe mode, creating new customer`
          );
          customerId = ""; // Reset to create new customer
        }
      }

      if (!customerId) {
        const customer = await stripe!.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: userId.toString(),
            source: "cash_payment",
          },
        });
        customerId = customer.id;
        user.subscription.stripeCustomerId = customerId;
        await user.save();
        console.log(
          `✅ Created new Stripe customer for cash payment: ${customerId}`
        );
      }

      const priceId = STRIPE_PRICE_IDS[planId as "pro" | "pro+"];

      // Validate Price ID
      if (!priceId || !priceId.startsWith("price_")) {
        console.error(`Invalid Price ID: ${priceId}. Must start with "price_"`);
        res.status(500).json({
          success: false,
          error:
            "Payment system misconfigured. Please contact support. (Invalid Price ID)",
        });
        return;
      }

      console.log("Creating Stripe Payment Link for cash payment:", {
        planId,
        priceId,
        userId: userId.toString(),
        userEmail: user.email,
        customerId,
      });

      // Create a Payment Link
      // NOTE: Cannot use customer_creation with recurring prices (subscriptions)
      // Instead, we rely on customer email matching for webhook
      const paymentLink = await stripe!.paymentLinks.create({
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        after_completion: {
          type: "redirect",
          redirect: {
            url: `${
              process.env.CLIENT_URL ||
              "https://skilledge-sz5fb.ondigitalocean.app"
            }/dashboard/billing?success=true&payment_type=cash`,
          },
        },
        metadata: {
          userId: userId.toString(),
          planId: planId,
          paymentMethod: "cash",
          userEmail: user.email,
          stripeCustomerId: customerId, // Store for webhook to use
        },
        // Prefill customer email to help match in webhook
        custom_text: {
          submit: {
            message: `Upgrading to ${planId.toUpperCase()} plan for ${
              user.email
            }`,
          },
        },
      });

      console.log("✅ Payment Link created successfully:", paymentLink.id);

      res.json({
        success: true,
        paymentLinkId: paymentLink.id,
        url: paymentLink.url,
        qrCodeData: paymentLink.url, // Frontend can convert this to QR code
      });
    } catch (error: any) {
      console.error("❌ Stripe payment link error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create payment link",
        details: error.message,
      });
    }
  }
);

/**
 * Verify Checkout Session and Update Subscription
 * POST /api/stripe/verify-session
 */
router.post(
  "/verify-session",
  authenticate,
  requireStripe,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req.user as any)?._id;
      const { sessionId } = req.body;

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      if (!sessionId) {
        res.status(400).json({ success: false, error: "Session ID required" });
        return;
      }

      // Retrieve the session from Stripe
      const session = await stripe!.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== "paid") {
        res.status(400).json({
          success: false,
          error: "Payment not completed",
        });
        return;
      }

      // Verify this session belongs to the requesting user
      if (session.metadata?.userId !== userId.toString()) {
        res.status(403).json({
          success: false,
          error: "Unauthorized access to session",
        });
        return;
      }

      // Update user subscription
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }

      const planId = session.metadata?.planId;
      if (!planId) {
        res.status(400).json({
          success: false,
          error: "Invalid session metadata",
        });
        return;
      }

      // Update subscription
      const wasAlreadyOnPlan =
        user.subscription.plan === planId &&
        user.subscription.status === "active";

      user.subscription.plan = planId as "pro" | "pro+";
      user.subscription.status = "active";

      // Only update start date if it's a new subscription
      if (!wasAlreadyOnPlan) {
        user.subscription.startDate = new Date();
      }

      user.subscription.stripeSubscriptionId = session.subscription as string;

      // Add minutes based on plan (stack if already subscribed)
      if (planId === "pro") {
        if (wasAlreadyOnPlan && user.subscription.minutesLeft > 0) {
          // Add 180 minutes to existing balance
          user.subscription.minutesLeft += 180;
          console.log(
            `➕ Added 180 minutes to existing Pro subscription. New balance: ${user.subscription.minutesLeft} minutes`
          );
        } else {
          // First time or expired subscription
          user.subscription.minutesLeft = 180;
        }
      } else if (planId === "pro+") {
        user.subscription.minutesLeft = -1; // Unlimited (can't stack)
      }

      // Get subscription details for end date
      let endDateSet = false;
      if (session.subscription && typeof session.subscription === "string") {
        try {
          const subscription = await stripe!.subscriptions.retrieve(
            session.subscription
          );
          // current_period_end exists on Subscription but TypeScript may not recognize it
          const periodEnd = (subscription as any).current_period_end;
          if (periodEnd && typeof periodEnd === "number") {
            user.subscription.endDate = new Date(periodEnd * 1000);
            endDateSet = true;
          }
        } catch (err) {
          console.error("Error retrieving subscription:", err);
        }
      }

      // Fallback: Set 30 days from now if we couldn't get it from Stripe
      if (!endDateSet) {
        user.subscription.endDate = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        );
        console.log("⏰ Set default 30-day billing period");
      }

      await user.save();
      console.log(
        `✅ Subscription verified and activated for user ${userId}: ${planId}`
      );

      res.json({
        success: true,
        subscription: {
          plan: user.subscription.plan,
          status: user.subscription.status,
          minutesLeft: user.subscription.minutesLeft,
          endDate: user.subscription.endDate,
        },
      });
    } catch (error: any) {
      console.error("Session verification error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to verify session",
        details: error.message,
      });
    }
  }
);

/**
 * Stripe Webhook Handler
 * POST /api/stripe/webhook
 * Note: express.raw() is applied in index.ts before this route
 */
router.post("/webhook", async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    res.status(400).send("No signature");
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe!.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ""
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session
        );
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription
        );
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription
        );
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice
        );
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

/**
 * Create Customer Portal Session
 * POST /api/stripe/create-portal-session
 */
router.post(
  "/create-portal-session",
  authenticate,
  requireStripe,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req.user as any)?._id;

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const user = await User.findById(userId);
      if (!user || !user.subscription.stripeCustomerId) {
        res.status(404).json({
          success: false,
          error: "No active subscription found",
        });
        return;
      }

      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

      const session = await stripe!.billingPortal.sessions.create({
        customer: user.subscription.stripeCustomerId,
        return_url: `${clientUrl}/dashboard/billing`,
      });

      res.json({
        success: true,
        url: session.url,
      });
    } catch (error: any) {
      console.error("Portal session error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create portal session",
        details: error.message,
      });
    }
  }
);

// =============== Webhook Handlers ===============

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
) {
  console.log("🔔 Webhook: checkout.session.completed", {
    sessionId: session.id,
    paymentStatus: session.payment_status,
    customerEmail: session.customer_email,
    customerId: session.customer,
    metadata: session.metadata,
  });

  let userId = session.metadata?.userId;
  let planId = session.metadata?.planId;
  let user = null;

  // Try to find user by metadata first (regular checkout)
  if (userId) {
    user = await User.findById(userId);
    if (user) {
      console.log(`✅ Found user by metadata userId: ${userId}`);
    }
  }

  // FALLBACK: If no metadata (Payment Link case), find user by customer ID or email
  if (!user && session.customer) {
    user = await User.findOne({
      "subscription.stripeCustomerId": session.customer as string,
    });
    if (user) {
      userId = (user._id as any).toString();
      console.log(`✅ Found user by Stripe customer ID: ${session.customer}`);
    }
  }

  // LAST RESORT: Find by email
  if (!user && session.customer_email) {
    user = await User.findOne({ email: session.customer_email });
    if (user) {
      userId = (user._id as any).toString();
      console.log(`✅ Found user by email: ${session.customer_email}`);
    }
  }

  if (!user || !userId) {
    console.error("❌ Could not find user for checkout session:", {
      sessionId: session.id,
      customerEmail: session.customer_email,
      customerId: session.customer,
      metadataUserId: session.metadata?.userId,
    });
    return;
  }

  // Determine plan from metadata or from line items
  if (!planId) {
    // Try to get plan from price ID in line items
    try {
      const lineItems = await stripe!.checkout.sessions.listLineItems(
        session.id
      );
      const priceId = lineItems.data[0]?.price?.id;
      if (priceId === STRIPE_PRICE_IDS.pro) {
        planId = "pro";
      } else if (priceId === STRIPE_PRICE_IDS["pro+"]) {
        planId = "pro+";
      } else if (priceId === STRIPE_PRICE_IDS.test) {
        planId = "test";
      }
      console.log(`📋 Determined plan from line items: ${planId}`);
    } catch (err) {
      console.error("Error fetching line items:", err);
    }
  }

  if (!planId) {
    console.error("❌ Could not determine plan ID from session");
    return;
  }

  // Update user subscription
  const wasAlreadyOnPlan =
    user.subscription.plan === planId && user.subscription.status === "active";

  user.subscription.plan = planId as "pro" | "pro+";
  user.subscription.status = "active";

  // Only update start date if it's a new subscription
  if (!wasAlreadyOnPlan) {
    user.subscription.startDate = new Date();
  }

  // Save Stripe customer ID if not already saved
  if (session.customer && !user.subscription.stripeCustomerId) {
    user.subscription.stripeCustomerId = session.customer as string;
  }

  user.subscription.stripeSubscriptionId = session.subscription as string;

  // Add minutes based on plan (stack if already subscribed)
  if (planId === "pro") {
    if (wasAlreadyOnPlan && user.subscription.minutesLeft > 0) {
      // Add 180 minutes to existing balance
      user.subscription.minutesLeft += 180;
      console.log(
        `➕ Added 180 minutes to existing Pro subscription. New balance: ${user.subscription.minutesLeft} minutes`
      );
    } else {
      // First time or expired subscription
      user.subscription.minutesLeft = 180;
    }
    user.subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  } else if (planId === "pro+") {
    user.subscription.minutesLeft = -1; // Unlimited (can't stack)
    user.subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  } else if (planId === "test") {
    // TEST PLAN: Give 10 minutes for testing
    if (wasAlreadyOnPlan && user.subscription.minutesLeft > 0) {
      user.subscription.minutesLeft += 10;
      console.log(
        `➕ Added 10 TEST minutes to existing subscription. New balance: ${user.subscription.minutesLeft} minutes`
      );
    } else {
      user.subscription.minutesLeft = 10;
    }
    user.subscription.endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  await user.save();
  console.log(
    `✅✅✅ Subscription activated for user ${userId}: ${planId} (${user.subscription.minutesLeft} minutes)`
  );
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const user = await User.findOne({
    "subscription.stripeCustomerId": customerId,
  });

  if (!user) {
    console.error(`User not found for customer: ${customerId}`);
    return;
  }

  // Update subscription status
  if (subscription.status === "active") {
    user.subscription.status = "active";

    // Determine plan from price ID
    const priceId = subscription.items.data[0]?.price.id;
    if (priceId === STRIPE_PRICE_IDS.pro) {
      user.subscription.plan = "pro";
      user.subscription.minutesLeft = 180;
    } else if (priceId === STRIPE_PRICE_IDS["pro+"]) {
      user.subscription.plan = "pro+";
      user.subscription.minutesLeft = -1;
    } else if (priceId === STRIPE_PRICE_IDS.test) {
      user.subscription.plan = "test" as any;
      user.subscription.minutesLeft = 10;
    }

    // Update end date
    const periodEnd = (subscription as any).current_period_end;
    if (periodEnd && typeof periodEnd === "number") {
      user.subscription.endDate = new Date(periodEnd * 1000);
    }
  } else {
    user.subscription.status = subscription.status as
      | "active"
      | "inactive"
      | "cancelled";
  }

  await user.save();
  console.log(`Subscription updated for customer ${customerId}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const user = await User.findOne({
    "subscription.stripeCustomerId": customerId,
  });

  if (!user) {
    console.error(`User not found for customer: ${customerId}`);
    return;
  }

  // Downgrade to free plan
  user.subscription.plan = "free";
  user.subscription.status = "cancelled";
  user.subscription.minutesLeft = 15;
  user.subscription.stripeSubscriptionId = undefined;
  user.subscription.endDate = undefined;

  await user.save();
  console.log(`Subscription cancelled for customer ${customerId}`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const user = await User.findOne({
    "subscription.stripeCustomerId": customerId,
  });

  if (!user) {
    console.error(`User not found for customer: ${customerId}`);
    return;
  }

  // Add minutes for pro plan on successful payment (monthly renewal or additional purchase)
  if (user.subscription.plan === "pro") {
    if (invoice.billing_reason === "subscription_cycle") {
      // Monthly renewal - add 180 minutes to existing balance
      if (user.subscription.minutesLeft > 0) {
        user.subscription.minutesLeft += 180;
        console.log(
          `➕ Monthly renewal: Added 180 minutes. New balance: ${user.subscription.minutesLeft} minutes`
        );
      } else {
        // First renewal or expired
        user.subscription.minutesLeft = 180;
      }
    }
  }
  // Pro+ already has unlimited
  user.subscription.status = "active";

  await user.save();
  console.log(`Invoice payment succeeded for customer ${customerId}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const user = await User.findOne({
    "subscription.stripeCustomerId": customerId,
  });

  if (!user) {
    console.error(`User not found for customer: ${customerId}`);
    return;
  }

  user.subscription.status = "inactive";
  await user.save();
  console.log(`Invoice payment failed for customer ${customerId}`);
}

export default router;
