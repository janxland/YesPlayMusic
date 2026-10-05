#!/usr/bin/env bash
# 分支护栏（方案 §7 第 2 层）：husky pre-commit 链首调用。
# 非 refactor/vue3-ts-pinia 分支上一律禁止承载重构提交（master 必须随时可发）。
ALLOWED="refactor/vue3-ts-pinia"
CURRENT="$(git branch --show-current)"
if [ "$CURRENT" != "$ALLOWED" ]; then
  echo "" >&2
  echo "❌ [assert-refactor-branch] 当前分支 '$CURRENT' ≠ '$ALLOWED'" >&2
  echo "   重构提交只允许发生在 $ALLOWED 分支上；请切分支或撤销本次提交。" >&2
  echo "" >&2
  exit 1
fi
exit 0
