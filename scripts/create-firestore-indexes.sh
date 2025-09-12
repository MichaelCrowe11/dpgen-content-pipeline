#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}
if [ -z "${PROJECT_ID}" ]; then
  echo "GCP project not set. Export GCP_PROJECT_ID or run: gcloud config set project <id>" >&2
  exit 1
fi

echo "Creating Firestore composite indexes in project: ${PROJECT_ID}" 

# Index 1: renders (channel_slug equality + created_at range/ordering)
gcloud firestore indexes composite create \
  --project="${PROJECT_ID}" \
  --collection-group="renders" \
  --field-config="fieldPath=channel_slug,order=ASCENDING" \
  --field-config="fieldPath=created_at,order=DESCENDING" 2>/dev/null || echo "renders index may already exist"

# Index 2: production_sessions (channel, status, created_at)
gcloud firestore indexes composite create \
  --project="${PROJECT_ID}" \
  --collection-group="production_sessions" \
  --field-config="fieldPath=channel_slug,order=ASCENDING" \
  --field-config="fieldPath=status,order=ASCENDING" \
  --field-config="fieldPath=created_at,order=DESCENDING" 2>/dev/null || echo "production_sessions index may already exist"

echo "Done. Propagation can take a few minutes."
