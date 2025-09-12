#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID=${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}
if [ -z "$PROJECT_ID" ]; then echo "Set GCP_PROJECT_ID or run gcloud config set project <id>" >&2; exit 1; fi

WORKFLOW_SA_NAME=${WORKFLOW_SA_NAME:-"deepparallel-workflow"}
RENDERER_SA_NAME=${RENDERER_SA_NAME:-"deepparallel-renderer"}
WORKFLOW_SA_EMAIL="${WORKFLOW_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
RENDERER_SA_EMAIL="${RENDERER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Creating service accounts in $PROJECT_ID" 
gcloud iam service-accounts create "$WORKFLOW_SA_NAME" --display-name "Workflow Orchestrator SA" --project "$PROJECT_ID" 2>/dev/null || echo "Workflow SA exists"
gcloud iam service-accounts create "$RENDERER_SA_NAME" --display-name "Renderer SA" --project "$PROJECT_ID" 2>/dev/null || echo "Renderer SA exists"

WORKFLOW_ROLES=(
  roles/aiplatform.user
  roles/datastore.user
  roles/run.invoker
  roles/workflows.invoker
  roles/storage.objectViewer
  roles/secretmanager.secretAccessor
  roles/logging.logWriter
  roles/bigquery.dataEditor
)

RENDERER_ROLES=(
  roles/storage.objectAdmin
  roles/datastore.user
  roles/secretmanager.secretAccessor
  roles/logging.logWriter
)

for r in "${WORKFLOW_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${WORKFLOW_SA_EMAIL}" --role "$r" --quiet
  echo "Granted $r to workflow SA"
done

for r in "${RENDERER_ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${RENDERER_SA_EMAIL}" --role "$r" --quiet
  echo "Granted $r to renderer SA"
done

echo "Done. Use these in deployments:"
echo "  Workflow SA: $WORKFLOW_SA_EMAIL"
echo "  Renderer SA: $RENDERER_SA_EMAIL"