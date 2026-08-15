#!/bin/bash
# dsh-vision 双击安装(macOS Finder 双击进入终端;Linux 亦可直接执行)
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装 Node 20+ :"
  echo "  brew install node      或     https://nodejs.org/"
  if [ -z "${CI:-}" ]; then read -r -p "按回车退出..."; fi
  exit 1
fi

if [ -z "${DSH_FA_NO_NPM:-}" ]; then
  echo "[1/3] 安装依赖（首次约 1-3 分钟）..."
  npm install || { echo "[错误] 依赖安装失败，请检查网络后重试。"; if [ -z "${CI:-}" ]; then read -r -p "按回车退出..."; fi; exit 1; }
fi

echo "[2/3] 部署插件（自动构建 + 链接 + 写补丁）..."
node scripts/install.mjs "$@" || { echo "[错误] 部署失败，请查看上方提示。"; if [ -z "${CI:-}" ]; then read -r -p "按回车退出..."; fi; exit 1; }

echo
echo "[3/3] 完成！请设置 VISION_API_KEY 后重启 dsh web，再按 Cmd+Shift+R 硬刷新。"
echo "详细文档见 docs/DEPLOY.md"
if [ -z "${CI:-}" ]; then read -r -p "按回车关闭窗口..."; fi
exit 0
