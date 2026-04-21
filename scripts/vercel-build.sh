#!/usr/bin/env bash
# Wrapper for the Vercel build step.
#
# In production, `npx convex deploy` occasionally fails because api.convex.dev
# returns 500 on the url_for_key call before our app build even starts. That's a
# Convex control-plane flake, not a repo problem, and it's bricked several
# consecutive deploys. This wrapper retries *only* that specific transient
# signature — real build failures (TypeScript errors, ESLint violations, Vite
# errors) still fail immediately on the first attempt.
set -eo pipefail

if [ "$VERCEL_ENV" != "production" ]; then
  exec npm run build
fi

MAX_ATTEMPTS=3
attempt=1

while true; do
  tmp=$(mktemp)
  set +e
  npx convex deploy --cmd 'npm run build' 2>&1 | tee "$tmp"
  code=${PIPESTATUS[0]}
  set -e

  if [ "$code" -eq 0 ]; then
    rm -f "$tmp"
    exit 0
  fi

  if [ "$attempt" -lt "$MAX_ATTEMPTS" ] \
     && grep -q "api.convex.dev" "$tmp" \
     && grep -qE "(500 Internal Server Error|InternalServerError)" "$tmp"; then
    echo ""
    echo "convex deploy hit transient api.convex.dev error (attempt $attempt/$MAX_ATTEMPTS); retrying in 15s..."
    rm -f "$tmp"
    attempt=$((attempt + 1))
    sleep 15
    continue
  fi

  rm -f "$tmp"
  exit "$code"
done
