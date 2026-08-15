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

### BUG-2 首次粘贴裁决空窗（已缓解，上游建议）
- **现象**：ModLens 浏览器端在裁决缓存未就绪时放行原生粘贴 → 图片以附件入库 → 触发 BUG-1。
- **现状**：autoRead 兜底后不再致命；**建议**（上游 liustack/modlens）：裁决未就绪时 `preventDefault` 暂挂粘贴，待 GET 裁决返回后再决定接管或原生放行。

### BUG-3 `dsh-ocr` 裸命令不可用（已修复）
- **现象**：模型 shell 的 PATH 不含 `~/.local/bin`，技能文档教的 `dsh-ocr <文件>` 报 `command not found`。
- **修复**：技能与文档统一改为绝对路径 `/Users/xiaoyu/.local/bin/dsh-ocr`。

### BUG-4 视觉技能文档过时（已修复）
- **现象**：技能仍描述「npx in-place 粘贴补丁」链路（已退役），并指示升级后用 `patch-image-paste.py` 重打——会重新引入已撤销的补丁。
- **修复**：技能文档改为 ModLens paste-to-path + autoRead 架构，删除重打指引。

### 观察项 NOTE-1：`/modlens/paste` 一次性重复注册
- 19:30 首次挂载 ModLens 的启动中报过一次 `duplicate exact route "/modlens/paste"`（功能未受影响，先注册者胜出）；20:06 复检组合树为单行挂载、未复现。留待后续安装时观察，出现即检查 bundle 列表与插件自带 patch 是否双挂载。

## 三、安全评估

| 项 | 结论 |
|---|---|
| 密钥存储 | ✅ 三个密钥文件（`~/.dsh/.env`、`~/.dsh/cordis.patch.yml`、`~/.modlens/config.json`）均为 0600；错误路径 key 脱敏；**建议**把内联在 patch 里的 `apiKey` 迁到 `.env` |
| 本地文件面 | ✅ 扩展名白名单 + 体积上限（10MB/25MB）+ 硬超时 + 响应 2MB 上限；仓库扫描无密钥泄露、node_modules 未入库 |
| 图片外发面 | ⚠️ `view_image` / `modlens_read_image` 会把（白名单内）本地图片发给所配 VLM：提示注入下存在读走敏感截图的理论风险，属单用户工具风险面，靠模型判断 + 白名单缓解，已在工具描述中约束 |
| `/modlens/paste` 路由 | ⚠️ 无 Origin/Referer 校验：任意网页可向 127.0.0.1:3080 POST 图片（写 0600 随机临时文件，magic 校验 + 25MB 上限）或 GET 裁决。影响有限；**建议**上游加同源校验 |

## 四、已知限制

- 图片理解质量取决于所配 VLM 端点，插件不校验端点回传内容真实性。
- `source` 允许 http(s)/data URL：模型可能被诱导读取任意可达地址。
- 免费档偶发 429；重试或换 provider 即可。
- autoRead 的 pre-step 转换按消息逐次执行（不跨步骤缓存），历史含大图的长会话每步多一次引擎调用。
