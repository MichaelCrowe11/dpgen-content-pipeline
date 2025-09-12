#!/bin/bash
set -euo pipefail

if ! command -v gcloud >/dev/null; then
  echo "gcloud CLI required" >&2; exit 1;
fi

PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}
if [ -z "$PROJECT_ID" ]; then echo "Set GCP_PROJECT_ID or configure gcloud project"; exit 1; fi

echo "Creating / updating secrets in project: $PROJECT_ID"

create_secret() {
  local name=$1
  local value=$2
  if [ -z "$value" ]; then echo "Skipping $name (empty)"; return; fi
  if gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1; then
    echo "Adding new version for secret $name"
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project "$PROJECT_ID" >/dev/null
  else
    echo "Creating secret $name"
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --project "$PROJECT_ID" >/dev/null
  fi
}

# Core API keys (expects env exported before running)
create_secret CSE_API_KEY "${CSE_API_KEY:-}" 
create_secret CSE_CX "${CSE_CX:-}" 
create_secret YOUTUBE_API_KEY "${YOUTUBE_API_KEY:-}" 
create_secret PERSPECTIVE_API_KEY "${PERSPECTIVE_API_KEY:-}" 

echo "Done. Configure Cloud Run with --set-secrets to mount these as env vars."
