#!/usr/bin/env bash
# 每域统一验证闭环（方案 §6 一键机械关，P0 阶段版）。
# 用法: ./scripts/verify-domain.sh [zone]
# FAIL 组：P0 收口必须归零的雷区；INFO 组：D1 之后才归零的项，仅记录不计失败。
set -uo pipefail
cd "$(dirname "$0")/.."

ZONE="${1:-all}"
fail=0

count_matches() {
  # $1 pattern  $2 exclude-prefix(可选)
  local out
  out=$(grep -rEn "$1" src --include='*.js' --include='*.vue' --include='*.ts' 2>/dev/null)
  if [ -n "${2:-}" ]; then
    echo "$out" | grep -v "^$2" | grep -c . || true
  else
    echo "$out" | grep -c . || true
  fi
}

assert_zero() {
  # $1 名称  $2 pattern  $3 exclude(可选)
  local n
  n=$(count_matches "$2" "${3:-}")
  if [ "$n" -eq 0 ]; then
    echo "PASS  [$ZONE] $1 = 0"
  else
    echo "FAIL  [$ZONE] $1 = ${n}（应归零）"
    grep -rEn "$2" src --include='*.js' --include='*.vue' --include='*.ts' 2>/dev/null \
      | grep -v "^${3:-}" | head -5
    fail=1
  fi
}

info_count() {
  local n
  n=$(count_matches "$2" "${3:-}")
  echo "INFO  [$ZONE] $1 = ${n}（D1 后归零）"
}

echo "== verify-domain: $ZONE =="

# ---- FAIL 组（P0 收口目标：全零） ----
assert_zero "模板管道 filter" \
  '\| (formatTime|formatDate|formatAlbumType|resizeImage|formatPlayCount|toHttps)'
assert_zero "实例事件 \$on/\$off/\$once" '\$on\(|\$off\(|\$once\('
assert_zero "Vue 全局 API 残留" 'Vue\.(filter|component|use|prototype|observable|set|delete)'
assert_zero "\$set/\$delete/\$children/\$listeners/\$scopedSlots" \
  '\$set\(|\$delete\(|\$children|\$listeners|\$scopedSlots'
assert_zero "window.require('electron') 泄漏（仅 platform/bridge.ts 允许）" \
  "window\.require\('electron'\)" "src/platform/bridge.ts"
assert_zero "process.env.IS_ELECTRON 泄漏（仅 platform/env.ts 允许）" \
  'process\.env\.IS_ELECTRON' "src/platform/env.ts"
assert_zero "new Player() 泄漏（仅 player/singleton.ts 允许）" \
  'new Player\(' "src/player/singleton.ts"

# api 层反向依赖（R14）：只看 src/api/** 与 utils/request.ts
api_dep=$(grep -rEn "import store|import router" src/api src/utils/request.ts 2>/dev/null | wc -l | tr -d ' ')
if [ "$api_dep" -eq 0 ]; then
  echo "PASS  [$ZONE] api 层无 store/router 反向依赖"
else
  echo "FAIL  [$ZONE] api 层 store/router 反向依赖 = ${api_dep}（应归零）"
  grep -rEn "import store|import router" src/api src/utils/request.ts 2>/dev/null | head -5
  fail=1
fi

# request.ts 专项
req=$(grep -cE "import store|import router" src/utils/request.ts 2>/dev/null)
req=${req:-0}
if [ "$req" -eq 0 ]; then
  echo "PASS  [$ZONE] utils/request.ts 无 store/router 依赖"
else
  echo "FAIL  [$ZONE] utils/request.ts 仍有 store/router 依赖 = $req"
  fail=1
fi

# $copyText 专项（P0.6）
assert_zero "\$copyText / vue-clipboard2 残留" '\$copyText|vue-clipboard2'

# ---- INFO 组（D1/D2 后归零，暂不计失败） ----
info_count "VUE_APP_ 环境变量引用" 'VUE_APP_'
info_count "CJS require( 残留" 'require\('
info_count "mapState/\$store 消费面（D6/D7 归零）" 'mapState\(|\$store\.'

# ---- 构建（FAIL 组全零或传参 --with-build 时执行） ----
if [ "$fail" -eq 0 ] || [ "${2:-}" = "--with-build" ]; then
  echo "== 运行 npm run build（约 1-3 分钟）=="
  if npm run build; then
    echo "PASS  [$ZONE] build"
  else
    echo "FAIL  [$ZONE] build"
    fail=1
  fi
else
  echo "SKIP  [$ZONE] build（FAIL 组未归零）"
fi

echo "== verify-domain: $ZONE -> $([ "$fail" -eq 0 ] && echo ALL-PASS || echo HAS-FAIL) =="
exit "$fail"
