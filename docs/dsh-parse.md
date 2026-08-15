# dsh-parse — 本地文档 → Markdown 结构化解析

> 方案第五层（L4 本地兜底扩展）：与 `dsh-ocr`（提文字）互补的**保结构文档解析**。
> 基于 [Microsoft markitdown](https://github.com/microsoft/markitdown)，本地运行、不联网、零费用。

## 定位

| 需求 | 组件 | 理由 |
|---|---|---|
| 只提取文字（截图/文档/PDF） | `dsh-ocr` | macOS Vision 框架，~0.5s，中文 OCR 强，免费不限量 |
| 整篇文档要保留标题/列表/表格结构 | `dsh-parse` | markitdown，~0.4s，输出可直接喂模型的 Markdown |
| 扫描件/手写/复杂版面/任意视觉问答 | `view_image` / `vision.py` | VLM（qwen3-vl-flash，免费档） |

## 安装

```sh
# 独立 venv，与 DSH profile 完全隔离，不影响 harness 升级
python3 -m venv ~/.dsh/skills/vision/.venv
~/.dsh/skills/vision/.venv/bin/pip install "markitdown[pdf,docx,xlsx,pptx]"

# 封装命令（薄 wrapper，转发现有 CLI）
install -m 755 scripts/dsh-parse.sh ~/.local/bin/dsh-parse
```

## 用法

```sh
dsh-parse <文件|http(s) URL> [-o 输出.md]
```

支持：pdf / docx / pptx / xlsx / csv / html / json / 图片（元信息，不 OCR）等。

## 验证记录（2026-08-15 实测）

生成 docx（textutil）/ pdf（cupsfilter，带文字层）/ xlsx（openpyxl）/ pptx（python-pptx）测试件：

- **PDF**：正文与 `## 标题`、列表结构保留 ✓（cupsfilter 生成件有 Kangxi radical 字形映射现象，属生成器问题）
- **DOCX**：中文/英文混排 + 标题列表结构完整 ✓
- **XLSX**：表格转 Markdown 表格（表头+数据行）✓（公式列显示 NaN 是 openpyxl 生成件无缓存值所致，真实 Excel 有缓存值）
- **PPTX**：`<!-- Slide number -->` + 标题/正文 ✓
- **耗时**：docx ~0.37s，pdf ~0.43s（与 dsh-ocr 同量级）
- **边界**：无参数输出 usage；文件不存在报错 exit 1（venv 缺失时给出安装提示）

## 分工铁律（写入 vision skill）

1. 只提文字 → `dsh-ocr`（更快更准）；整篇/保结构 → `dsh-parse`；两者不够 → VLM。
2. 图片型 PDF（扫描件）无文字层，`dsh-parse` 输出少属正常——先 `dsh-ocr` 逐页提文字，再 `view_image` 复核。
3. `dsh-parse` 不 OCR 图片内容（图片只取元信息）。
