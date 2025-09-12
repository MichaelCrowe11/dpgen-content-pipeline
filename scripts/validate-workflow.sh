#!/usr/bin/env bash
set -euo pipefail

TEMPLATE="workflows-gcp/main.yaml.tmpl"
RENDERED="/tmp/workflow.rendered.yaml"
TEST_URL="https://example-renderer/run"

if [ ! -f "$TEMPLATE" ]; then
  echo "Template not found: $TEMPLATE" >&2
  exit 1
fi

cp "$TEMPLATE" "$RENDERED"
sed -i "s|__RENDERER_URL__|$TEST_URL|g" "$RENDERED"

if grep -q "__RENDERER_URL__" "$RENDERED"; then
  echo "Placeholder still present after substitution" >&2
  exit 2
fi

echo "Workflow template renders successfully (placeholder replaced)."
echo "Rendered file at $RENDERED"
