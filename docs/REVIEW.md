# 视觉方案测试审查报告（2026-08-15）

结论先行：**4 个 bug 全部修复，1 个观察项待观察，4 项安全评估完成。** 当前方案在默认 DeepSeek 路由上贴图/历史图片均不再导致会话崩溃。

## 一、测试矩阵（当日实测）

| 组件 | 测试 | 结果 |
|---|---|---|
| `view_image`（qwen3-vl-flash） | 本地 PNG 任意问答/OCR/UI 分析 | ✅ 中文回答正常 |
| `dsh-ocr` | PNG 中文截图逐字提取 | ✅ 全文提取（需绝对路径，见 BUG-3） |
| `vision.py` | 兜底提问（自动选 provider） | ✅ 正常回答 |
| `modlens_read_image` | 结构化证据（OCR/布局/语义） | ✅ JSON 证据正常 |
| ModLens paste-to-path | GET 裁决 `{"takeover":true}`；POST 非图片 400；贴图得到路径文本 | ✅ |
| ModLens autoRead | 组合树校验 `autoRead: true` 单行挂载；历史含图会话不再崩 | ✅ |
| `(modlens vision)` 变体 | 裁决逻辑按模型元数据正确排除自身包装路由 | ✅（代码审查） |
| 组合树 | `dsh --dump-config --profile web`：modlens 单行、配置生效 | ✅ |

## 二、发现的 Bug

### BUG-1 默认路由历史图片毒化（已修复）
- **现象**：装 ModLens 时撤掉了 dsh-llm-deepseek 的「图片→路径」补丁后，默认 DeepSeek 路由对消息/历史中的图片块整轮抛 `UNSUPPORTED_CONTENT`；历史重放每次携带旧图片 → 会话**永久瘫痪**（纯文本重试也失败）。
- **根因**：纯文本适配器的 `assertTextOnly` + 历史里存有旧图片块；ModLens 三层防护（paste-to-path / vision 变体 / autoRead）中前两者都不覆盖历史重放，而 autoRead 默认关闭。
- **修复**：`~/.dsh/profiles/web/cordis.patch.yml` 给 `modlens` 行开 `autoRead: true`（pre-step 全局图片→证据文本，失败降级不崩）；对旧会话日志做外科手术替换图片块为文字说明（首帧保持「恰好一行 session header」约束，重压后 zstd 完整性校验通过）。

### BUG-2 首次粘贴裁决空窗（已失效，随 BUG-5 关闭 paste-to-path）
- **现象**：ModLens 浏览器端在裁决缓存未就绪时放行原生粘贴 → 图片以附件入库 → 触发 BUG-1。
- **现状**：paste-to-path 已整体关闭（见 BUG-5），此空窗不存在。

### BUG-3 `dsh-ocr` 裸命令不可用（已修复）
- **现象**：模型 shell 的 PATH 不含 `~/.local/bin`，技能文档教的 `dsh-ocr <文件>` 报 `command not found`。
- **修复**：技能与文档统一改为绝对路径 `/Users/xiaoyu/.local/bin/dsh-ocr`。

### BUG-4 视觉技能文档过时（已修复）
- **现象**：技能仍描述「npx in-place 粘贴补丁」链路（已退役），并指示升级后用 `patch-image-paste.py` 重打——会重新引入已撤销的补丁。
- **修复**：技能文档改为 ModLens paste-to-path + autoRead 架构，删除重打指引。

### BUG-5 贴图不再显示整张图，只剩路径文字（已修复）
- **现象**：装 ModLens 后贴图被 paste-to-path 拦截，输入框只出现 `/var/folders/.../paste.png` 路径文本，看不到图片预览；用户此前（旧补丁时代）贴图会显示整张图。
- **根因**：旧 npx 补丁同时把 DeepSeek 适配器 `inputModalities` 声明为 `["text","image"]`（贴图准入放行 + 原生缩略图），ModLens 安装撤补丁后声明回到 `["text"]`，原生贴图被 DSH 准入拒绝，paste-to-path 只能以「路径文本」顶替。
- **修复**：① `pasteToPath: false` 关闭路径接管；② 恢复 `inputModalities: ["text","image"]` 声明（2 处，DSH 升级后需重改）；③ 恢复序列化层 `imageBlocksToText` 补丁（见 BUG-6）——贴图恢复「整张图缩略图 + 正常回答」。

### BUG-6 autoRead 把聊天里的图替换成 OCR 文字（已修复：关闭 autoRead）
- **现象**：开 autoRead 后贴图，**聊天里显示的整张图被替换成英文证据文本**（durable log 里只剩转换后文本，图片块被改写；实测端到端复现）。
- **根因**：autoRead 挂在 `agent/pre-step`，改写的是**消息本身**（随后被持久化到会话表面），而非只改发给模型的 wire；与「UI 保留缩略图」的目标冲突。
- **修复**：架构定稿为**序列化层转换**——关闭 autoRead（`autoRead: false`），由 dsh-llm-deepseek 的 `imageBlocksToText` 补丁只改 wire（图片块→本地路径文本；聊天保留整张图；历史重放同样转换不再崩）。paste-to-path 保持关闭。

### 观察项 NOTE-1：`/modlens/paste` 一次性重复注册
- 19:30 首次挂载 ModLens 的启动中报过一次 `duplicate exact route "/modlens/paste"`（功能未受影响，先注册者胜出）；20:06 复检组合树为单行挂载、未复现。留待后续安装时观察，出现即检查 bundle 列表与插件自带 patch 是否双挂载。

## 三、安全评估

| 项 | 结论 |
|---|---|
| 密钥存储 | ✅ 三个密钥文件（`~/.dsh/.env`、`~/.dsh/cordis.patch.yml`、`~/.modlens/config.json`）均为 0600；错误路径 key 脱敏；**建议**把内联在 patch 里的 `apiKey` 迁到 `.env` |
| 本地文件面 | ✅ 扩展名白名单 + 体积上限（10MB/25MB）+ 硬超时 + 响应 2MB 上限；仓库扫描无密钥泄露、node_modules 未入库 |
| 图片外发面 | ⚠️ `view_image` / `modlens_read_image` 会把（白名单内）本地图片发给所配 VLM：提示注入下存在读走敏感截图的理论风险，属单用户工具风险面，靠模型判断 + 白名单缓解，已在工具描述中约束 |
| `/modlens/paste` 路由 | ✅ 已随 `pasteToPath: false` 整体下线（回退为 SPA 兜底页），该项风险自动消除 |

## 四、准度与速率优化（2026-08-15 晚）

- **回退链修复**：dsh-vision 的 `fallbackModels` 默认只在智谱默认端点生效，本机配 DashScope 后原为空链——免费档 429/404/5xx 即彻底失败。已配 `fallbackModels: [qwen-vl-plus]`（仅失败时计费）。
- **工具并发确认**：`view_image` `isConcurrencySafe: () => true`，多图并行读取不受限。
- **路由策略**：文字提取 → `dsh-ocr`（本地 ~0.5s 免费）；视觉问答 → `view_image`（qwen3-vl-flash ~1–3s）；可引用证据 → `modlens_read_image`。
- **`(modlens vision)` 变体对 DeepSeek 已消失**：准入声明 `["text","image"]` 使 modlens 的 shouldWrap 判定「已支持图片」而不再包装——属预期，文档已同步（仅 glm 等未声明图片的 provider 仍有此变体）。
- **已知取舍**：序列化层方案下模型读图需多一次工具往返（换取聊天里保留整张图）。
- **实测基准**（1740×928 截图，单样本）：dsh-ocr ~0.5s；vision.py 直连 ~8.7s；modlens 结构化管线 ~24s（多轮调用）。提速惯例：VLM 前大图先 `sips -Z 1600` 压缩；精度惯例：文字先 dsh-ocr、高精度换 qwen-vl-plus/max、uncertainty 清单交叉验证。

## 五、已知限制

- 图片理解质量取决于所配 VLM 端点，插件不校验端点回传内容真实性。
- `source` 允许 http(s)/data URL：模型可能被诱导读取任意可达地址。
- 免费档偶发 429：有 qwen-vl-plus 回退 + dsh-ocr / vision.py 兜底。
- 子智能体（subagent）会话暂不支持图片（DSH 原生限制）。
- 序列化补丁位于 npx 缓存，DSH 升级后需按 docs/patch-image-blocks.md 重打（含准入声明与 imageBlocksToText）。
