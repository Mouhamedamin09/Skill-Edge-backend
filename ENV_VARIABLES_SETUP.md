# Environment Variables Setup Guide

## Step-by-Step Setup for DigitalOcean

### 🔑 You Already Have:

- **STRIPE_SECRET_KEY**: Get from Stripe Dashboard → API Keys
- **STRIPE_PUBLISHABLE_KEY**: Get from Stripe Dashboard → API Keys (not needed in backend)

---

## 📋 STEP 1: Create Stripe Products

### 1.1 Go to Stripe Dashboard

👉 https://dashboard.stripe.com/test/products

### 1.2 Create Pro Plan Product

1. Click **"+ Add product"**
2. Fill in:
   - **Name**: `SkillEdge Pro`
   - **Description**: `Professional interview preparation with 3 hours per month`
   - **Pricing model**: Standard pricing
   - **Price**: `29.00` USD
   - **Billing period**: `Monthly`
   - **Payment type**: `Recurring`
3. Click **"Save product"**
4. ⚠️ **COPY THE PRICE ID** - It looks like: `price_1AbcDefGhiJkLmNoP`

### 1.3 Create Pro+ Plan Product

1. Click **"+ Add product"** again
2. Fill in:
   - **Name**: `SkillEdge Pro+`
   - **Description**: `Unlimited interview preparation access`
   - **Pricing model**: Standard pricing
   - **Price**: `99.00` USD
   - **Billing period**: `Monthly`
   - **Payment type**: `Recurring`
3. Click **"Save product"**
4. ⚠️ **COPY THE PRICE ID** - It looks like: `price_2XyzAbcDefGhiJkLm`

**✅ Save these Price IDs - you'll need them!**

---

## 📋 STEP 2: Create Webhook

### 2.1 Go to Webhooks

👉 https://dashboard.stripe.com/test/webhooks

### 2.2 Create Endpoint

1. Click **"+ Add endpoint"**
2. **Endpoint URL**: `https://monkfish-app-nnhdy.ondigitalocean.app/api/stripe/webhook`
   (Replace with your actual backend URL)
3. **Description**: `SkillEdge subscription webhook`
4. Click **"Select events"**

### 2.3 Select These Events:

- ✅ `checkout.session.completed`
- ✅ `customer.subscription.created`
- ✅ `customer.subscription.updated`
- ✅ `customer.subscription.deleted`
- ✅ `invoice.payment_succeeded`
- ✅ `invoice.payment_failed`

5. Click **"Add endpoint"**
6. ⚠️ **COPY THE SIGNING SECRET** - It looks like: `whsec_abcdefghijklmnopqrstuvwxyz123456`

**✅ Save this Webhook Secret - you'll need it!**

---

## 📋 STEP 3: Add Environment Variables to DigitalOcean

### 3.1 Go to Your Backend App

1. Open DigitalOcean Dashboard
2. Go to **Apps**
3. Select your backend app: `backend` or `server`
4. Click **Settings** tab
5. Click **Environment Variables** (or **App-Level Environment Variables**)

### 3.2 Add These Variables:

Click **"Edit"** then **"Add Variable"** for each one:

#### Required Variables:

| Key                        | Value                                        | Notes                                     |
| -------------------------- | -------------------------------------------- | ----------------------------------------- |
| `STRIPE_SECRET_KEY`        | `sk_test_YOUR_STRIPE_SECRET_KEY_HERE`        | ✅ Get from Stripe Dashboard → API Keys   |
| `STRIPE_WEBHOOK_SECRET`    | `whsec_YOUR_WEBHOOK_SECRET_HERE`             | ⚠️ From Step 2.3 (webhook signing secret) |
| `STRIPE_PRO_PRICE_ID`      | `price_YOUR_PRO_PRICE_ID_HERE`               | ⚠️ From Step 1.2 (Pro product price ID)   |
| `STRIPE_PRO_PLUS_PRICE_ID` | `price_YOUR_PROPLUS_PRICE_ID_HERE`           | ⚠️ From Step 1.3 (Pro+ product price ID)  |
| `CLIENT_URL`               | `https://skilledge-sz5fb.ondigitalocean.app` | ✅ Your frontend URL                      |

#### Already Set (Don't change):

- `NODE_ENV` = `production`
- `MONGODB_URI` = `mongodb+srv://...`
- `JWT_SECRET` = `your-secret`
- `OPENAI_API_KEY` = `sk-proj-...`
- `PORT` = `8080`

### 3.3 Save and Deploy

1. Click **"Save"**
2. DigitalOcean will automatically **redeploy** your app
3. Wait for deployment to complete (2-3 minutes)

---

## 🧪 STEP 4: Test Payment Flow

### 4.1 Test Cards

Use these test cards in Stripe Checkout:

| Card Number           | Result                     |
| --------------------- | -------------------------- |
| `4242 4242 4242 4242` | ✅ Success                 |
| `4000 0000 0000 0002` | ❌ Card declined           |
| `4000 0025 0000 3155` | 🔒 Requires authentication |

**For all test cards:**

- Expiry: Any future date (e.g., `12/25`)
- CVC: Any 3 digits (e.g., `123`)
- ZIP: Any 5 digits (e.g., `12345`)

### 4.2 Test the Flow

1. Go to your app: https://skilledge-sz5fb.ondigitalocean.app
2. Login to your account
3. Go to **Billing** page
4. Click **"Upgrade to Pro"**
5. You'll be redirected to Stripe Checkout
6. Enter test card: `4242 4242 4242 4242`
7. Complete payment
8. You should be redirected back with success message
9. Your plan should update to "Pro"

### 4.3 Verify Webhook

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click on your webhook
3. Check **"Events"** tab
4. You should see successful events like:
   - ✅ `checkout.session.completed` - 200 OK
   - ✅ `customer.subscription.created` - 200 OK
   - ✅ `invoice.payment_succeeded` - 200 OK

---

## 📝 Quick Copy-Paste Template

⚠️ **IMPORTANT**: Get your actual keys from Stripe Dashboard before filling this in!

```env
# REQUIRED - Get from Stripe Dashboard → API Keys
# https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_SECRET_KEY_HERE

# REQUIRED - Get from Stripe Dashboard → Webhooks (after creating webhook)
# https://dashboard.stripe.com/test/webhooks
STRIPE_WEBHOOK_SECRET=whsec_YOUR_ACTUAL_WEBHOOK_SECRET_HERE

# REQUIRED - Get from Stripe Dashboard → Products (after creating products)
# https://dashboard.stripe.com/test/products
STRIPE_PRO_PRICE_ID=price_YOUR_ACTUAL_PRO_PRICE_ID_HERE
STRIPE_PRO_PLUS_PRICE_ID=price_YOUR_ACTUAL_PROPLUS_PRICE_ID_HERE

# Your frontend URL
CLIENT_URL=https://skilledge-sz5fb.ondigitalocean.app
```

---

## ❓ Troubleshooting

### Problem: "Payment system is not configured"

**Solution**: Make sure all 4 Stripe environment variables are set in DigitalOcean and the app has been redeployed.

### Problem: Webhook not receiving events

**Solution**:

1. Check webhook URL is correct: `https://your-backend-url.com/api/stripe/webhook`
2. Verify webhook secret matches what's in Stripe Dashboard
3. Check webhook events are selected correctly

### Problem: Payment succeeds but subscription not updated

**Solution**:

1. Check backend logs for webhook errors
2. Verify Price IDs match what's in Stripe Dashboard
3. Re-send webhook event from Stripe Dashboard to test

---

## 🎯 Checklist

- [ ] Step 1: Created "SkillEdge Pro" product ($29/month)
- [ ] Step 1: Created "SkillEdge Pro+" product ($99/month)
- [ ] Step 1: Copied both Price IDs
- [ ] Step 2: Created webhook endpoint
- [ ] Step 2: Selected all required events
- [ ] Step 2: Copied webhook signing secret
- [ ] Step 3: Added all 4 Stripe env variables to DigitalOcean
- [ ] Step 3: Saved and triggered redeploy
- [ ] Step 4: Tested with card `4242 4242 4242 4242`
- [ ] Step 4: Verified webhook events in Stripe Dashboard

---

## 🚀 You're Done!

Once all checkboxes are complete, your Stripe integration is fully configured and ready to accept payments!

For production (real money):

1. Activate your Stripe account
2. Create live products and webhook
3. Replace test keys with live keys
4. Update environment variables with live keys
