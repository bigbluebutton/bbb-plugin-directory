#!/usr/bin/env bash
# Starts a throwaway S3-compatible storage (SeaweedFS) for local tests of the
# publishing scripts: one bucket, a read/write key, anonymous reads (like a
# public bucket) and CORS GET from any origin.
#
#   scripts/local/storage-up.sh            # S3 API on http://127.0.0.1:8333
#   source <(scripts/local/storage-up.sh --env)   # export the S3_* variables
#   scripts/local/storage-up.sh --down
set -euo pipefail
NAME=${STORAGE_CONTAINER:-bbb-plugin-directory-s3}
PORT=${STORAGE_PORT:-8333}
BUCKET=${S3_BUCKET:-plugins}
KEY=local-access-key
SECRET=local-secret-key

if [ "${1:-}" = --env ]; then
  cat <<ENV
export S3_ENDPOINT=http://127.0.0.1:$PORT S3_BUCKET=$BUCKET S3_FORCE_PATH_STYLE=true
export S3_ACCESS_KEY_ID=$KEY S3_SECRET_ACCESS_KEY=$SECRET
ENV
  exit 0
fi
if [ "${1:-}" = --down ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 0
fi

config=$(mktemp -d)
cat > "$config/s3.json" <<JSON
{
  "identities": [
    { "name": "publisher", "credentials": [{ "accessKey": "$KEY", "secretKey": "$SECRET" }], "actions": ["Admin", "Read", "List", "Write"] },
    { "name": "anonymous", "actions": ["Read:$BUCKET"] }
  ]
}
JSON
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8333" -v "$config:/config:ro" \
  chrislusf/seaweedfs server -dir=/data -s3 -s3.config=/config/s3.json -s3.allowedOrigins='*' >/dev/null
for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null || curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" | grep -qE '^(200|403)$'; then break; fi
  sleep 1
done
echo -e "S3 API on http://127.0.0.1:$PORT. Create the bucket and its CORS rule with:
  source <($0 --env) && node src/cli/configure-bucket.js --create"
