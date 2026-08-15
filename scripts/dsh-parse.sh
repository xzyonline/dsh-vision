#!/bin/bash
# dsh-parse — 本地文档 → Markdown 结构化解析（Microsoft markitdown 封装）
# 支持: pdf / docx / pptx / xlsx / csv / html / json / 图片(元信息) 等
# 纯文字提取仍优先 dsh-ocr（更快更准）；需要保留版面/表格/结构时用本命令。
# 依赖: ~/.dsh/skills/vision/.venv (markitdown)；不碰 DSH profile、不依赖 harness 版本。
set -euo pipefail

MARKITDOWN="$HOME/.dsh/skills/vision/.venv/bin/markitdown"

if [[ $# -eq 0 || "$1" == "-h" || "$1" == "--help" ]]; then
  cat <<'EOF'
dsh-parse — 文档/文件 → Markdown（本地免费，不联网）

用法: dsh-parse <文件|http(s) URL> [-o 输出.md]
支持: pdf docx pptx xlsx csv html json 图片(元信息) 等
说明: 提取纯文字请优先 dsh-ocr（更快更准）；
      需要保留版面/表格/标题结构的文档解析用本命令；
      解析失败或要 OCR 图片内容时回退 dsh-ocr / view_image。
EOF
  exit 0
fi

if [[ ! -x "$MARKITDOWN" ]]; then
  echo "dsh-parse: 未找到 $MARKITDOWN，请先安装 vision skill 的 venv" >&2
  exit 1
fi

exec "$MARKITDOWN" "$@"
