# Razorpay subscriptions: setup

SteelConnect360 bills companies through Razorpay Subscriptions (free trial; one portal or a package;
monthly, quarterly, half-yearly or yearly). Plans are **priced per person** (`SEAT_PRICE` in
`apps/web/src/billing/plans.ts`, at least 5 people, 2 management viewers free, volume discounts from the
26th and 101st person). SteelConnect360 creates the matching Razorpay plan for each package, number of
people, cycle and currency on first use.

Currencies: India pays in rupees (GST extra), the UK in pounds (VAT extra), everyone else in US dollars.
Super Admin sets the currency per company (Add company > Country, or the company's Billing panel).

People added or removed: the subscription is moved to the plan for the new number of people from the
next billing date (Razorpay "update subscription", end of cycle). Razorpay cannot change UPI AutoPay or
e-mandate subscriptions; for those the company admin sees "Confirm new amount" on Plan and billing,
which sets the subscription up again for the new amount from the next billing date.

## 1. Keys (Razorpay Dashboard)
1. Sign in at dashboard.razorpay.com and switch to **Test mode** first.
2. Settings > API Keys > Generate key. Note the **Key Id** (`rzp_test_...`) and **Key Secret**.
3. Settings > Webhooks > Add new webhook:
   - URL: `https://main.d2bmw6xnh0jekq.amplifyapp.com/api/webhooks/razorpay`
   - Secret: make up a long random string and note it.
   - Events: `subscription.activated`, `subscription.charged`, `subscription.pending`,
     `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `payment.failed`.
4. Make sure **Subscriptions** is enabled on the account (Products > Subscriptions).
5. For foreign clients (pounds and US dollars): Settings > Payment methods > **International payments**
   must be enabled, with GBP and USD among the currencies. Razorpay reviews this; until it is approved,
   pound and dollar checkouts fail. Foreign subscriptions are paid by card.

## 2. Store the keys in AWS (once per stage)
Use the `put` helper you used for the other secrets (stage `dev`):

    put app/razorpayKeyId          rzp_test_xxxxxxxx
    put app/razorpayKeySecret      <key secret>
    put app/razorpayWebhookSecret  <webhook secret>

They are read from `/orbit/dev/app/*` (SecureString). The app picks them up within 5 minutes.
Until they exist, Plan and billing shows "Online payments are not set up yet".

## 3. Database
Run the migrations (add `billing_plans`, `company_subscriptions`, `company_billing`, `billing_events`, and
from 0032 pounds and `subscription_seats`):

    pnpm db:migrate

## 4. Go live
Repeat steps 1 and 2 with **Live mode** keys (`rzp_live_...`) and a live webhook.

## 5. Super Admin
- **Companies > Add company**: for a client who contacted SteelConnect360. Enter the company, country (India or
  outside India), the admin's name and email, portals, trial days, and whether plans are released.
  The admin signs in with that email and opens the Company admin portal.
- **Company page > Billing**: change currency, release or hide plans, and trial days. Hidden plans mean
  the admin sees "Your plan is arranged by the SteelConnect360 team" instead of the price list.
- **Subscriptions**: every company's plan, amount, renewal and last payment. When a company subscribes
  or pays, the menu shows a badge and the row is marked New until you press Seen.
