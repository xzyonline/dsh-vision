# dsh-vision — 给纯文本 DeepSeek 的「眼睛」（DSH 视觉方案总入口）

> 本仓库是 **DeepSeek Harness（DSH）视觉方案**的总入口：让没有视觉能力的 DeepSeek 模型
> 在 **Web 端与 CLI 端**都能看图、贴图、OCR、追问细节。核心插件 `view_image`（本仓库维护）
> 负责「任意视觉问答」；方案还整合了 [ModLens](https://github.com/liustack/modlens)（粘贴链路与
> 请求前图片转换）、macOS 本地 OCR（免费离线）与多 provider 兜底脚本。
>
> 方案修订：2026-08-15（ModLens 架构落地 + autoRead 修复）｜审查报告见 [docs/REVIEW.md](docs/REVIEW.md)

## 为什么需要这套方案

- DSH 的 DeepSeek chat-completions 适配器是**纯文本**的：消息或历史中出现任何图片块会整轮报
  `UNSUPPORTED_CONTENT`，且历史重放会把图片永久带进每次请求——即「贴一张图，会话永久瘫痪」。
- 本方案在**四层**上把图片在进入模型前转成文字证据：贴图链路 → 请求前转换 → 模型工具 → 本地兜底。

## 架构总览

| 层 | 组件 | 端 | 职责 |
|---|---|---|---|
| L1 粘贴链路 | 原生贴图 + 准入声明 | Web | 贴图按 DSH 原生附件入库，**输入框/消息里显示整张图缩略图**；模型元数据声明 `["text","image"]` 让准入放行（见 DEPLOY.md 第 2 步） |
| L2 序列化转换 | `imageBlocksToText` 补丁 | 双端 | 只改**发给模型的 wire**：图片块 →「已保存为本地文件：<路径>」文本；**聊天里的整张图不受影响**；历史重放同样转换，不再崩会话 |
| L3 模型工具 | `view_image`（本插件）/ `modlens_read_image` | 双端 | 模型拿到路径后自主读图：任意视觉问题（view_image）/ 结构化证据（modlens：OCR+布局+语义+不确定性清单） |
| L4 本地兜底 | `dsh-ocr` / `vision.py` | 双端 | macOS Vision 框架离线 OCR（免费不限量）/ 多 provider（智谱/豆包/通义/OpenAI/Claude）脚本 |
| L5 模型变体 | `(modlens vision)` 包装路由 | 双端 | 仅对**未声明图片输入的 provider**（如 glm）注册；DeepSeek 已由准入声明+序列化补丁覆盖，不再有此变体 |

## 端到端链路

```
用户在输入框贴图
   │ DSH 原生附件入库（准入声明 ["text","image"] 放行）→ 聊天里显示整张图缩略图
   ▼
发给模型的 wire：L2 图片块 →「已保存为本地文件：<路径>」文本 ──▶ 模型调 view_image / dsh-ocr 读图
```

- **历史含图的老会话**：序列化补丁在重放时同样转换，不再 `UNSUPPORTED_CONTENT`（2026-08-15 已实测修复）。
- **autoRead 已关闭**（`autoRead: false`）：它会在 pre-step 改写消息本身，把聊天里的图替换成 OCR 英文文字（2026-08-15 实测踩坑），序列化补丁是保留整张图的正确层。
- **paste-to-path 已关闭**（`pasteToPath: false`）：它会把贴图换成路径文字、吞掉图片预览。

## 实现效果（2026-08-15 实测）

- `view_image`（qwen3-vl-flash）：任意视觉问答、OCR、数数、读图表、UI 分析，中文回答。
- `dsh-ocr`：中文+英文离线 OCR，PNG/JPEG/HEIC/PDF 逐页，零费用零网络。
- `vision.py`：view_image 不可用时自动按可用 key 选 provider 兜底，实测可用。
- `modlens_read_image`：结构化 JSON 证据（`ocr.full_text`、布局阅读序、语义、不确定性清单）。
- 贴图：原生入库显示整张图缩略图，序列化层转成路径文本后模型正常读图回答（实测）。
- **修复前**：默认路由历史含图会话每轮必崩 `UNSUPPORTED_CONTENT`；**修复后**：正常响应。

## 准度与速率优化（2026-08-15）

- **文字提取永远先走 dsh-ocr**（本地 ~0.5s、免费、中文 OCR 强）；视觉问答走 `view_image`（qwen3-vl-flash 免费快档 ~1–3s）；需要可引用证据时用 `modlens_read_image`。
- **回退链**：`view_image` 已配 `fallbackModels: [qwen-vl-plus]`——免费档被 429/404/5xx 限流时自动回退付费档（**仅在失败时计费**），消除「免费档限流即彻底不可用」的单点。
- **并发**：`view_image` / `modlens_read_image` 均并发安全，多图可并行读。
- **高精度场景**：临时把 `model` 改为 `qwen-vl-plus` / `qwen-vl-max`（付费档精度更高），或 `vision.py --provider <name>` 换引擎对比；结构化证据用 `modlens_read_image`（含不确定性清单，可交叉验证）。
- **已知取舍**：序列化层方案下模型要先花一轮工具调用读图（相比 autoRead 多一次往返，但保住了聊天里的整张图）。

## 部署（双端）

| 端 | 方式 | 组件 | 详见 |
|---|---|---|---|
| **Web**（`dsh web`，浏览器 GUI） | pnpm 装插件 + 配置行 | dsh-vision（宿主级，全 profile 可用）+ ModLens（web profile，开 autoRead）+ 密钥 | [docs/DEPLOY.md](docs/DEPLOY.md) |
| **CLI / headless**（`dsh --profile headless/tui`） | 同上宿主级安装 | view_image、modlens_read_image、dsh-ocr、vision.py 全部可用；无浏览器粘贴链路 | [docs/DEPLOY.md](docs/DEPLOY.md) |

一键安装 dsh-vision 插件：见下方 [Install](#install)（Windows/macOS/Linux 预构建包或源码）。

## Install（dsh-vision 插件本身）

### 下载预构建包（推荐）

1. 从 [Releases](https://github.com/xzyonline/dsh-vision/releases) 获取 `dsh-vision-0.1.0.zip`，用 `SHA256SUMS.txt` 校验。
2. 解压后双击 `install.bat`（Windows）/ `install.command`（macOS/Linux）。
3. 重启 dsh web，浏览器硬刷新（macOS `Cmd+Shift+R` / Windows `Ctrl+Shift+R`）。

卸载：`uninstall.bat` / `uninstall.command`。

### 从源码

```sh
git clone https://github.com/xzyonline/dsh-vision.git
cd dsh-vision && npm install && node scripts/install.mjs
```

## Configuration（view_image）

| Option | Default | Notes |
|---|---|---|
| `apiKey` | `''` | 依次回退 `VISION_API_KEY` → `ZHIPUAI_API_KEY` → `DASHSCOPE_API_KEY`（`~/.dsh/.env` 或环境变量）。本地端点留空 |
| `baseURL` | `https://open.bigmodel.cn/api/paas/v4` | 任意 OpenAI 兼容基址；Ollama：`http://localhost:11434/v1` |
| `model` | `glm-4.6v-flash` | 本机实测配置：DashScope `qwen3-vl-flash`（快、免费档、OCR 好） |
| `fallbackModels` / `maxTokens` / `timeoutMs` / `maxImageBytes` | 免费链 / `2048` / `60s` / `10MB` | 见 `~/.dsh/cordis.patch.yml` 示例 |

## 安全模型

- 密钥只存 0600 文件（`~/.dsh/.env`、`~/.dsh/cordis.patch.yml`、`~/.modlens/config.json`）；错误消息全程 key 脱敏。
- 本地文件扩展名白名单 + 体积上限 + 硬超时；响应体 2 MB 硬上限。
- 图片外发面：`view_image`/`modlens_read_image` 会把（白名单内）本地图片发给所配 VLM——单用户工具的模型判断风险面，已在 [docs/REVIEW.md](docs/REVIEW.md) 评估。
- 更多见 [SECURITY.md](SECURITY.md) 与 [docs/REVIEW.md](docs/REVIEW.md)。

## 已知问题与修复记录

见 [docs/REVIEW.md](docs/REVIEW.md)（2026-08-15 审查：4 个 bug 全修复、1 个观察项、4 项安全评估）。

## 引用与致谢

| 借鉴/依赖 | 说明 | 链接 |
|---|---|---|
| [ModLens](https://github.com/liustack/modlens)（MIT，Leon Liu） | 粘贴→文件路径范式、autoRead、`(modlens vision)` 包装路由、结构化证据 | github.com/liustack/modlens |
| Pi / OpenCode / Claude Code | 「给文本模型文件路径而非图片」范式（ModLens 的 paste-to-path 与 recover-paste 明确借鉴并标注） | modlens README 与源码注释 |
| 通义千问 qwen3-vl-flash | 本机默认 VLM（DashScope compatible-mode） | [阿里云百炼](https://www.alibabacloud.com/help/en/model-studio/vision) |
| 智谱 GLM-4.6V-Flash | 插件默认免费档 | [open.bigmodel.cn](https://open.bigmodel.cn) |
| macOS Vision framework | `dsh-ocr` 本地 OCR 引擎 | [Apple Developer](https://developer.apple.com/documentation/vision) |
| DeepSeek Harness（DSH） | 宿主平台（Cordis 组合、工具注册、web/CLI profile） | 本地预览版 |

## License

- BSD-3-Clause，见 [LICENSE](LICENSE)；依赖归因见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- 不捆绑任何模型权重或第三方服务密钥；识图能力由你配置的端点提供。
