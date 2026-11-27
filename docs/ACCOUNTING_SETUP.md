# Accounting connections: setup

Company admin > **Accounting** sends Sales invoices and Purchase bills to the company's accounts
software. One per company: **Zoho Books**, **QuickBooks Online**, **Xero** (online, sign in once) or
**Tally** (download files and import them; nothing to set up on our side).

Each online provider needs SteelConnect360 registered as an app with that provider, once. Until a
provider's keys are stored, its card says "Coming soon". Tally works straight away.

Redirect address for each provider (use your live domain once it is connected):

    https://main.d2bmw6xnh0jekq.amplifyapp.com/api/accounting/zoho/callback
    https://main.d2bmw6xnh0jekq.amplifyapp.com/api/accounting/quickbooks/callback
    https://main.d2bmw6xnh0jekq.amplifyapp.com/api/accounting/xero/callback

## 1. Zoho Books
1. Go to api-console.zoho.com (signed in as the SteelConnect360 owner) > Add Client > **Server-based Applications**.
2. Name: SteelConnect360. Homepage: your site. Authorized Redirect URI: the Zoho address above.
3. Create, then copy the **Client ID** and **Client Secret**.
4. Settings > Multi-DC: switch on the data centres your clients use (India, US, EU, UK...).

## 2. QuickBooks Online (Intuit)
1. developer.intuit.com > Dashboard > Create an app > **QuickBooks Online and Payments**, scope **Accounting**.
2. Keys and credentials > Development: add the QuickBooks redirect address; copy Client ID and Secret.
   To test, set `APP_QUICKBOOKS_ENV=sandbox` in Amplify and use a sandbox company.
3. For real clients: complete Intuit's production questionnaire, then use the **Production** keys
   (remove `APP_QUICKBOOKS_ENV`).

## 3. Xero
1. developer.xero.com > My Apps > New app > **Web app**.
2. Redirect URI: the Xero address above. Copy Client ID, then generate a Client Secret.
3. Xero allows 25 connected organisations per app until the app is certified (Xero App Partner).

## 4. Store the keys in AWS (once per stage)
On your Mac, in the project folder:

    ./infra/scripts/put-accounting-secrets.sh dev

It creates the encryption key for tokens automatically (keep it: changing it disconnects every
company) and asks for each Client ID and Secret, hidden. Press Enter to skip a provider for now.

## 5. Database
    pnpm db:migrate

(adds `acct_connections` and `acct_sync`, migration 0037)

## How companies use it
- **Online:** Accounting > Connect > sign in to their accounts software and allow access > choose
  the income and expense accounts and taxes > Save. Then "Send all not sent", or switch on
  automatic sending. Each invoice and bill shows Sent, Failed (with the reason) or Not sent.
- **Tally:** Accounting > Set up Tally > ledger names and company GSTIN > Save. Then download
  file 1 (customers and suppliers) and import it under Gateway of Tally > Import > Masters, then
  file 2 (invoices and bills) under Import > Transactions.
