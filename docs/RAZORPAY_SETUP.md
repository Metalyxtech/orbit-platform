# Razorpay subscriptions: setup

Orbit bills companies through Razorpay Subscriptions (7-day free trial; Timesheet, Purchase or both;
monthly, quarterly, half-yearly or yearly). Plans and prices live in
`apps/web/src/billing/plans.ts`; Orbit creates the matching Razorpay plans on first use.

Indian companies pay in rupees (GST extra). Companies outside India pay the same plans in US dollars
at `USD_RATE` (90 rupees = 1 dollar, rounded up). Super Admin sets the currency per company.

## 1. Keys (Razorpay Dashboard)
1. Sign in at dashboard.razorpay.com and switch to **Test mode** first.
2. Settings > API Keys > Generate key. Note the **Key Id** (`rzp_test_...`) and **Key Secret**.
3. Settings > Webhooks > Add new webhook:
   - URL: `https://main.d2bmw6xnh0jekq.amplifyapp.com/api/webhooks/razorpay`
   - Secret: make up a long random string and note it.
   - Events: `subscription.activated`, `subscription.charged`, `subscription.pending`,
     `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `payment.failed`.
4. Make sure **Subscriptions** is enabled on the account (Products > Subscriptions).
5. For foreign clients (US dollars): Settings > Payment methods > **International payments** must be
   enabled. Razorpay reviews this; until it is approved, dollar checkouts fail.

## 2. Store the keys in AWS (once per stage)
Use the `put` helper you used for the other secrets (stage `dev`):

    put app/razorpayKeyId          rzp_test_xxxxxxxx
    put app/razorpayKeySecret      <key secret>
    put app/razorpayWebhookSecret  <webhook secret>

They are read from `/orbit/dev/app/*` (SecureString). The app picks them up within 5 minutes.
Until they exist, Plan and billing shows "Online payments are not set up yet".

## 3. Database
Run the migration (adds `billing_plans`, `company_subscriptions`, `company_billing`, `billing_events`):

    pnpm db:migrate

## 4. Go live
Repeat steps 1 and 2 with **Live mode** keys (`rzp_live_...`) and a live webhook.

## 5. Super Admin
- **Companies > Add company**: for a client who contacted Orbit. Enter the company, country (India or
  outside India), the admin's name and email, portals, trial days, and whether plans are released.
  The admin signs in with that email and opens the Company admin portal.
- **Company page > Billing**: change currency, release or hide plans, and trial days. Hidden plans mean
  the admin sees "Your plan is arranged by the Orbit team" instead of the price list.
- **Subscriptions**: every company's plan, amount, renewal and last payment. When a company subscribes
  or pays, the menu shows a badge and the row is marked New until you press Seen.
