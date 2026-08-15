---
name: vision
description: "本机已装好的『给 DeepSeek 的眼睛』工具链。当用户发来/提到图片、截图、PDF、图表、UI 报错截图、设计稿，说『看下这张图 / 识别这个文档 / 这个截图里是什么 / 帮我读一下这个 PDF』等任何需要看图或识文档的请求时使用本 skill。五层能力：① view_image 工具（dsh-vision 插件，接通义千问 qwen3-vl-flash，模型可自主调用）；② modlens_read_image 工具（结构化证据：OCR+布局+语义）；③ 本地 OCR dsh-ocr（macOS Vision 框架，免费离线，文档/截图文字提取首选）；④ dsh-parse（markitdown 封装，PDF/Word/PPT/Excel 保结构转 Markdown，本地免费）；⑤ vision.py 兜底脚本（任意 OpenAI 兼容 VLM）。"
---

# vision — 本机的视觉能力（眼睛）

纯文本的 DeepSeek 自己看不了图。本机已搭好五层「眼睛」，按下面优先级使用。

## 用户直接「粘贴图片」的链路（2026-08-15 终版）

用户可以在对话框里**直接粘贴/拖入图片**（PNG/JPG/WebP/GIF）。链路：

1. **原生贴图**：图片按 DSH 原生附件入库（`~/.dsh/attachments/v1/objects/<前2位>/<sha256>`），
   **聊天里显示整张图缩略图**。放行靠 DeepSeek 适配器的 `inputModalities: ["text","image"]` 声明
   （npx 里 2 处，DSH 升级后需重改，见 DEPLOY.md）；贴图被拒提示「当前模型不支持图片」=该声明丢了。
2. **序列化层转换**（imageBlocksToText 补丁，dsh-llm-deepseek/lib/index.js）：只改发给模型的 wire，
   图片块 → 「用户粘贴的图片已保存为本地文件：<路径>」文本；**聊天里的整张图不受影响**；
   模型按路径用 view_image / dsh-ocr 读取。历史重放同样转换，不会再 UNSUPPORTED_CONTENT。
3. **已关闭的组件**：autoRead（pre-step 改写会把聊天里的图替换成 OCR 文字，实测踩坑已关）、
   paste-to-path（把贴图换成路径文字、吞图片预览，已关）。两个开关都在
   `~/.dsh/profiles/web/cordis.patch.yml` 的 `modlens` 行（autoRead: false, pasteToPath: false）。
4. **模型变体**：`(modlens vision)` 变体仅对未声明图片输入的 provider（如 glm）注册；DeepSeek 已由准入声明+序列化补丁覆盖，默认路由下无此变体。

⚠️ 铁律：**绝不能在 `~/.dsh/profiles/node_modules/` 里把包换成真实目录**——DSH 每次启动的 heal 会要求所有包是符号链接，否则所有 `dsh web`（含 DSH.app）直接启动失败（2026-08-14 实测踩坑）。

⚠️ 历史含图的老会话若仍报 `UNSUPPORTED_CONTENT`：确认序列化补丁（imageBlocksToText）在位且 web 已重启；旧图附件丢失时模型会得到失效路径，属正常降级，不影响对话。

## 优先级与工具选择

| 需求 | 用哪个 | 命令/方式 |
|---|---|---|
| 任意视觉问题（看图、数数、读图表、UI 分析） | **view_image 工具**（首选） | 直接调用 `view_image` 工具，参数 `source`（文件绝对路径/URL）+ `question`（具体问题） |
| 结构化识图（需要 OCR 全文+布局+语义证据时） | **modlens_read_image 工具** | 参数 `path`（本地绝对路径/URL）+ 可选 `prompt` |
| 提取文字（文档、PDF、截图里的文字） | **dsh-ocr**（本地免费，优先于 VLM，省额度） | `/Users/xiaoyu/.local/bin/dsh-ocr <文件路径>`（**必须绝对路径**：模型 shell 的 PATH 不含 ~/.local/bin） |
| 文档转 Markdown（PDF/Word/PPT/Excel 保标题/列表/表格结构） | **dsh-parse**（本地免费） | `/Users/xiaoyu/.local/bin/dsh-parse <文件> [-o 输出.md]` |
| view_image 不可用/想换模型/自定义端点 | vision.py 兜底脚本 | `~/.dsh/skills/vision/.venv/bin/python ~/.dsh/skills/vision/vision.py <图片> "<问题>"` |
| 用户要看当前屏幕内容 | 先截图再 OCR/view_image | `screencapture -x /tmp/dsh-shot.png` 然后 `/Users/xiaoyu/.local/bin/dsh-ocr /tmp/dsh-shot.png`（需屏幕录制权限，见下） |

## view_image（dsh-vision 插件）

- 模型自己判断何时调用；`source` 支持本地绝对路径、http(s) URL、data URL。
- 后端配置在 `~/.dsh/cordis.patch.yml`（`dsh-vision` 条目，权限 600）：baseURL 为 DashScope compatible-mode，模型 `qwen3-vl-flash`（快、免费档、OCR 好）；`~/.dsh/.env`（600）里存有 `VISION_API_KEY`/`DASHSCOPE_API_KEY`，供插件与 vision.py 兜底脚本自动加载。
- 调用失败看返回的错误文本：429 是限流稍后重试，401 是 key 失效。
- 换模型/加智谱：编辑 `~/.dsh/cordis.patch.yml` 的 `config`（baseURL/model），改完重启 web 生效。

## modlens_read_image（ModLens 插件）

- 与 view_image 互补：返回**结构化 JSON 证据**（`ocr.full_text` 逐字转录、布局阅读序、语义、不确定性清单），需要引用原文证据时优先。
- 引擎复用 `~/.modlens/config.json`（600）的 provider（本机= DashScope qwen3-vl-flash）；失败看错误文本，`npx @liustack/modlens doctor` 可体检。

## dsh-ocr（本地 OCR，免费离线）

```sh
/Users/xiaoyu/.local/bin/dsh-ocr /path/to/xxx.png /path/to/xxx.pdf
```

- 基于 macOS Vision 框架（中文+英文），支持 png/jpg/heic/tiff/gif 与 PDF（逐页输出）。
- 不需要任何 API key、不走网络、不限量——**文档和截图里的文字提取永远先走它**，不够再上 VLM。

## dsh-parse（本地文档→Markdown，免费离线）

```sh
/Users/xiaoyu/.local/bin/dsh-parse /path/to/xxx.pdf /path/to/xxx.docx [-o /path/to/out.md]
```

- 基于 Microsoft markitdown（装在 `~/.dsh/skills/vision/.venv`，独立 venv 不碰 DSH），把 PDF/Word/PPT/Excel/CSV/HTML 等转成**保结构的 Markdown**（标题/列表/表格），本地运行、不联网、零费用。
- 分工：**只提文字 → dsh-ocr（~0.5s 更快更准）；整篇文档/要保留标题表格结构 → dsh-parse（~0.4s）**。两者都不够（扫描件、手写、复杂版面）再上 view_image。
- 扫描件/图片型 PDF 没有文字层，dsh-parse 输出少属正常——先 dsh-ocr 逐页提文字，再 view_image 复核。
- dsh-parse 不 OCR 图片内容（图片文件只取元信息）；升级依赖：`~/.dsh/skills/vision/.venv/bin/pip install -U "markitdown[pdf,docx,xlsx,pptx]"`。

## vision.py 兜底

```sh
~/.dsh/skills/vision/.venv/bin/python ~/.dsh/skills/vision/vision.py --provider qwen <图片路径> "<问题>"
```

- 内置 provider：`zhipu` / `doubao` / `qwen` / `openai` / `anthropic`，省略 `--provider` 时按 `VISION_PROVIDER` → 第一个有 key 的内置 provider 自动选。
- key 来源：`~/.dsh/.env`（自动加载）或环境变量；`VISION_API_KEY` 可作为任意 provider 的通用兜底 key。
- 自定义端点：设 `{NAME}_API_KEY` / `{NAME}_BASE_URL` / `{NAME}_MODEL` 即可（Ollama 本地等）。

## 截图（可选，需一次授权）

`dsh-ocr`/`view_image` 处理**已有文件**不需要任何授权。若要「看当前屏幕」，agent 会用 `screencapture` 截图——macOS 会要求给宿主进程**屏幕录制权限**：系统设置 → 隐私与安全性 → 屏幕录制，勾选运行 DSH 的那个应用（Terminal / iTerm / 由 launchd 拉起的 node 进程按提示授权）。授权一次永久生效。

## 实测基准与惯例（2026-08-15 晚，同一张 1740×928 截图单样本）

| 引擎 | 耗时 | 适用 |
|---|---|---|
| dsh-ocr（本地） | ~0.5s | 文字提取永远优先 |
| dsh-parse（本地） | ~0.4s | PDF/Office 保结构转 Markdown |
| view_image / vision.py（qwen3-vl-flash） | ~4-9s 波动 | 任意视觉问答 |
| modlens_read_image（结构化管线，多轮调用） | ~24s | 仅需要可引用证据/交叉验证时 |

提速惯例：交给 VLM 前，大图（长边 >2000px 或 >2MB）先用
`sips -Z 1600 <图> --out /tmp/v.jpg` 压缩（输入 token 是 VLM 耗时主因）。
dsh-ocr 无需压缩。

精度惯例：重要文字/数据先 dsh-ocr（本地准、免费），存疑再用 view_image 复核；
高精度需求临时换 qwen-vl-plus/max 或 vision.py --provider 对比；
modlens 的不确定性清单（uncertainty）是交叉验证依据。

## 已知注意

- 重启 web 后 `view_image` 才出现在工具列表里（插件在重启时挂载）；没重启的话先用 dsh-ocr + vision.py。
- 免费档可能偶发 429；view_image 已配回退链（qwen-vl-plus，仅失败时计费）；文字提取直接走 dsh-ocr 最稳（本地免费不限量）。
- dsh-parse 的 venv 与 DSH 完全隔离（`~/.dsh/skills/vision/.venv`），装包/升级不影响 harness 升级，反之亦然。
- 本 skill 与 GitHub 方案仓库（xzyonline/dsh-vision）同步维护，改动请两边一起更新。
