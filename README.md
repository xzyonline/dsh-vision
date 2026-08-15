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
| L2 请求前转换 | ModLens `autoRead` | 双端 | `agent/pre-step` 把消息里的**所有**图片块（新贴图、拖拽、历史重放、嵌套 tool-result）转成 OCR 证据文本；失败降级为说明文字，**不再崩会话** |
| L3 模型工具 | `view_image`（本插件）/ `modlens_read_image` | 双端 | 模型主动看图：任意视觉问题（view_image）/ 结构化证据（modlens：OCR+布局+语义+不确定性清单） |
| L4 本地兜底 | `dsh-ocr` / `vision.py` | 双端 | macOS Vision 框架离线 OCR（免费不限量）/ 多 provider（智谱/豆包/通义/OpenAI/Claude）脚本 |
| L5 模型变体 | `(modlens vision)` 包装路由 | 双端 | 选择该变体时图片请求前被转换为证据文本，**保留 UI 缩略图与原始日志** |

## 端到端链路

```
用户在输入框贴图
   │ DSH 原生附件入库（准入声明 ["text","image"] 放行）→ 输入框显示整张图缩略图
   ▼
消息携带图片块 ──▶ L2 autoRead 在请求前转成 OCR 证据文本 ──▶ 纯文本模型照常回答
```

- **历史含图的老会话**：autoRead 在重放时同样转换，不再 `UNSUPPORTED_CONTENT`（2026-08-15 已实测修复）。
- **ModLens 的 paste-to-path 已关闭**（`pasteToPath: false`）：它会把贴图换成路径文字、吞掉图片预览；原生贴图 + autoRead 双保险已取代它。

## 实现效果（2026-08-15 实测）

- `view_image`（qwen3-vl-flash）：任意视觉问答、OCR、数数、读图表、UI 分析，中文回答。
- `dsh-ocr`：中文+英文离线 OCR，PNG/JPEG/HEIC/PDF 逐页，零费用零网络。
- `vision.py`：view_image 不可用时自动按可用 key 选 provider 兜底，实测可用。
- `modlens_read_image`：结构化 JSON 证据（`ocr.full_text`、布局阅读序、语义、不确定性清单）。
- 贴图：原生入库显示整张图缩略图，autoRead 转成 OCR 证据文本后正常回答（实测）。
- **修复前**：默认路由历史含图会话每轮必崩 `UNSUPPORTED_CONTENT`；**修复后**：正常响应。

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
