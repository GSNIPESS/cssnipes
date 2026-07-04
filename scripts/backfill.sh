#!/usr/bin/env bash
# Exhaustive PandaScore backfill driver. Loops each task in dependency order,
# in resumable chunks, until the provider has no more history or the run is
# blocked (e.g. hourly quota) — safe to re-run anytime; cursors resume.
set -u
cd "$(dirname "$0")/.."

CHUNK="${CHUNK:-5000}"

for task in teams players events matches; do
  echo "=== backfill: $task ==="
  while true; do
    out=$(npm run ingest -- --sport cs2 --provider pandascore-backfill --task "$task" --limit "$CHUNK" 2>&1)
    line=$(echo "$out" | grep -E "\[cs2/pandascore-backfill\]" | tail -1)
    echo "$line"
    echo "$out" | grep -E "^\s+warn:" | head -3
    fetched=$(echo "$line" | sed -n 's/.*fetched=\([0-9]*\).*/\1/p')
    if echo "$line" | grep -q "FAILED"; then
      echo "!!! $task blocked/failed — cursor saved, re-run later to resume"
      exit 2
    fi
    if [ -z "$fetched" ] || [ "$fetched" -eq 0 ]; then
      echo "--- $task exhausted ---"
      break
    fi
  done
done
echo "=== backfill complete ==="
