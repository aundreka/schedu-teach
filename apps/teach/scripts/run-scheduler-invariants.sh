#!/usr/bin/env bash
# Runs the scheduler invariant checks (algorithm/__invariants.ts) via ts-node.
# Wired to `npm run test:scheduler`.
set -euo pipefail

cd "$(dirname "$0")/.."

TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx","esModuleInterop":true,"isolatedModules":false}' \
  npx --no-install ts-node --transpile-only --skip-project algorithm/__invariants.ts
