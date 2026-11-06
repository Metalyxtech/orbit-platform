# Razorpay subscriptions: setup

Orbit bills companies through Razorpay Subscriptions. Plans and prices live in
`apps/web/src/billing/plans.ts`; Orbit creates the matching Razorpay plans on first use.

## 1. Keys (Razorpay Dashboard)
1. Sign in at dashboard.razorpay.com and switch to **Test mode** first.
2. Settings > API Keys > Generate key. Note the **Key Id** (`rzp_test_...`) and **Key Secret**.
3. Settings > Webhooks > Add new webhook:
   - URL: `https://main.d2bmw6xnh0jekq.amplifyapp.com/api/webhooks/razorpay`
   - Secret: make up a long random string and note it.
   - Events: `subscription.activated`, `subscription.charged`, `subscription.pending`,
     `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `payment.failed`.
4. Make sure **Subscriptions** is enabled on the account (Products > Subscriptions).

## 2. Store the keys in AWS (once per stage)
Use the `put` helper you used for the other secrets (stage `dev`):

    put app/razorpayKeyId          rzp_test_xxxxxxxx
    put app/razorpayKeySecret      <key secret>
    put app/razorpayWebhookSecret  <webhook secret>

They are read from `/orbit/dev/app/*` (SecureString). The app picks them up within 5 minutes.
Until they exist, Plan and billing shows "Online payments are not set up yet".

## 3. Database
Run the migration (adds `billing_plans`, `company_subscriptions`, `billing_events`):

    pnpm db:migrate

## 4. Go live
Repeat steps 1 and 2 with **Live mode** keys (`rzp_live_...`) and a live webhook.
