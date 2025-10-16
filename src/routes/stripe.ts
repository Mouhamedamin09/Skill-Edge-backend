import express, { Request, Response } from "express";
import Stripe from "stripe";
import { authenticate } from "../middleware/auth";
import User from "../models/User";

const router = express.Router();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

// Price IDs for each plan (you'll need to create these in Stripe Dashboard)
const STRIPE_PRICE_IDS = {
  pro: process.env.STRIPE_PRO_PRICE_ID || "price_pro_monthly",
  "pro+": process.env.STRIPE_PRO_PLUS_PRICE_ID || "price_proplus_monthly",
};

/**
 * Create Stripe Checkout Session
 * POST /api/stripe/create-checkout-session
 */
router.post(
  "/create-checkout-session",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req.user as any)?._id;
      const { planId } = req.body;

      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      if (!planId || !["pro", "pro+"].includes(planId)) {
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
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: userId.toString(),
          },
        });
        customerId = customer.id;
        user.subscription.stripeCustomerId = customerId;
        await user.save();
      }

      const priceId = STRIPE_PRICE_IDS[planId as "pro" | "pro+"];
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

      // Create Checkout Session
      const session = await stripe.checkout.sessions.create({
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
 * Stripe Webhook Handler
 * POST /api/stripe/webhook
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers["stripe-signature"];

    if (!sig) {
      res.status(400).send("No signature");
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
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
  }
);

/**
 * Create Customer Portal Session
 * POST /api/stripe/create-portal-session
 */
router.post(
  "/create-portal-session",
  authenticate,
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

      const session = await stripe.billingPortal.sessions.create({
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
  const userId = session.metadata?.userId;
  const planId = session.metadata?.planId;

  if (!userId || !planId) {
    console.error("Missing userId or planId in session metadata");
    return;
  }

  const user = await User.findById(userId);
  if (!user) {
    console.error(`User not found: ${userId}`);
    return;
  }

  // Update user subscription
  user.subscription.plan = planId as "pro" | "pro+";
  user.subscription.status = "active";
  user.subscription.startDate = new Date();
  user.subscription.stripeSubscriptionId = session.subscription as string;

  // Set minutes based on plan
  if (planId === "pro") {
    user.subscription.minutesLeft = 180; // 3 hours
    user.subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  } else if (planId === "pro+") {
    user.subscription.minutesLeft = -1; // Unlimited
    user.subscription.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  }

  await user.save();
  console.log(`Subscription activated for user ${userId}: ${planId}`);
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
    }

    // Update end date
    const periodEnd = (subscription as any).current_period_end;
    if (periodEnd) {
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

  // Renew minutes for pro plan on successful payment
  if (user.subscription.plan === "pro") {
    user.subscription.minutesLeft = 180; // Refresh to 3 hours
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
