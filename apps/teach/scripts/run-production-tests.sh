#!/usr/bin/env bash
# Runs production-readiness tests (algorithm/__production.ts) via ts-node.
# Wired to `npm run test:production`.
set -euo pipefail

cd "$(dirname "$0")/.."

TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","esModuleInterop":true,"isolatedModules":false}' \
  npx --no-install ts-node --transpile-only --skip-project algorithm/__production.ts
