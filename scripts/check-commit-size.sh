#!/usr/bin/env bash
# Advisory check for BuildPlan.md §4.1: a normal commit has >= 3 files and >= 60 inserted lines.
# Run on the staged diff before committing. A documented exception may proceed.
set -euo pipefail

git diff --cached --numstat | awk '
  { files++; if ($1 != "-") ins += $1 }
  END {
    printf "%d files, %d insertions\n", files, ins
    if (files < 3 || ins < 60) { print "BELOW MINIMUM — add related work or document the exception"; exit 1 }
  }'
