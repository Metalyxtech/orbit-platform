#!/usr/bin/env bash
# Stores the accounting connection keys for one stage (SecureString, /orbit/<stage>/app/*).
# Usage: ./infra/scripts/put-accounting-secrets.sh dev
# Every value is typed hidden; press Enter to skip a provider you are not using yet.
set -euo pipefail
STAGE="${1:?usage: put-accounting-secrets.sh dev|prod}"
REGION="${AWS_REGION:-ap-southeast-1}"
P="/orbit/${STAGE}/app"

save() { aws ssm put-parameter --region "$REGION" --name "$P/$1" --type SecureString --value "$2" --overwrite >/dev/null && echo "  saved $P/$1"; }
ask() { # name description
  local value=""
  read -r -s -p "$2 (input hidden, Enter to skip): " value; echo
  [[ -z "$value" ]] && { echo "  skipped $1"; return; }
  save "$1" "$value"
}

# The key that encrypts every company's tokens. Created once: changing it later disconnects everyone.
if aws ssm get-parameter --region "$REGION" --name "$P/accountingTokenKey" >/dev/null 2>&1; then
  echo "  kept $P/accountingTokenKey (already set)"
else
  save accountingTokenKey "$(openssl rand -base64 48 | tr -d '\n')"
fi

echo "== Zoho Books (api-console.zoho.com > Server-based Applications) =="
ask zohoClientId "Zoho Client ID"
ask zohoClientSecret "Zoho Client Secret"
echo "== QuickBooks Online (developer.intuit.com > your app > Keys and credentials) =="
ask quickbooksClientId "QuickBooks Client ID"
ask quickbooksClientSecret "QuickBooks Client Secret"
echo "== Xero (developer.xero.com > My Apps > your app) =="
ask xeroClientId "Xero Client ID"
ask xeroClientSecret "Xero Client Secret"
echo "Done. The app picks the keys up within 5 minutes."
