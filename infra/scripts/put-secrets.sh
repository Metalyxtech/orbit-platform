#!/usr/bin/env bash
# Creates / updates the SecureString parameters for one stage (Section 7.3).
# Usage: ./infra/scripts/put-secrets.sh dev
# You will be asked for each value; leave empty to keep the current one.
set -euo pipefail
STAGE="${1:?usage: put-secrets.sh dev|prod}"
REGION="${AWS_REGION:-ap-southeast-1}"
P="/orbit/${STAGE}"

put() { # name description [generate]
  local name="$1" desc="$2" gen="${3:-}"
  local value=""
  if [[ -n "$gen" ]]; then
    read -r -p "$desc [press Enter to generate a random value]: " value
    [[ -z "$value" ]] && value="$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)"
  else
    read -r -s -p "$desc (input hidden, Enter to skip): " value; echo
    [[ -z "$value" ]] && { echo "  skipped $name"; return; }
  fi
  aws ssm put-parameter --region "$REGION" --name "$name" --type SecureString --value "$value" --overwrite >/dev/null
  echo "  saved $name"
}

echo "== App secrets ($P/app/*) =="
put "$P/app/neonTenantUrl"        "Neon app_user POOLED connection string"
put "$P/app/neonControlUrl"       "Neon app_user POOLED connection string (same as above for now)"
put "$P/app/workosApiKey"         "WorkOS API key (sk_...)"
put "$P/app/workosCookiePassword" "Cookie password" gen
TIMER_SECRET="$(openssl rand -hex 32)"
aws ssm put-parameter --region "$REGION" --name "$P/app/timerHmacSecret" --type SecureString --value "$TIMER_SECRET" --overwrite >/dev/null
echo "  saved $P/app/timerHmacSecret (generated)"

echo "== Worker secrets ($P/workers/*) =="
put "$P/workers/neonUrl" "Neon worker connection string (direct, not pooled)"
aws ssm put-parameter --region "$REGION" --name "$P/workers/timerHmacSecret" --type SecureString --value "$TIMER_SECRET" --overwrite >/dev/null
echo "  saved $P/workers/timerHmacSecret (same value as the app)"
read -r -p "From address (e.g. notifications@mail.example.com): " FROM
[[ -n "$FROM" ]] && aws ssm put-parameter --region "$REGION" --name "$P/workers/fromAddress" --type SecureString --value "$FROM" --overwrite >/dev/null
read -r -p "Reply-to (e.g. support@example.com, Enter to skip): " REPLY
[[ -n "$REPLY" ]] && aws ssm put-parameter --region "$REGION" --name "$P/workers/replyTo" --type SecureString --value "$REPLY" --overwrite >/dev/null
read -r -p "Sandbox allowlist, comma separated tester emails ('*@yourdomain.com' allowed): " ALLOW
[[ -n "$ALLOW" ]] && aws ssm put-parameter --region "$REGION" --name "$P/workers/sandboxAllowlist" --type SecureString --value "$ALLOW" --overwrite >/dev/null

echo "== CI ($P/ci/*) =="
put "$P/ci/neonOwnerUrl" "Neon OWNER connection string (used only by the pipeline for migrations)"
echo "Done."
