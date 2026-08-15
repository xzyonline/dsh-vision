# 测试与验收报告（TESTING）

> 最后更新：2026-08-15 · 覆盖版本 v0.2.0
> 可视化报告：`assets/test-report.html`（渲染截图 `assets/test-report.jpg`）· 测试样图 `assets/test-image.png`

## 一、测试环境

- 宿主：DeepSeek Harness（web profile，macOS arm64，Node 26）
- 主模型路由：`deepseek-v4-pro`（纯文本）——视觉能力全部来自本方案桥接层
- VLM 引擎：通义 qwen3-vl-flash / qwen-vl-plus（DashScope）、Gemini `gemini-flash-latest`（故障转移链）
- 本地 OCR：macOS Vision 框架（`dsh-ocr`）

## 二、验收矩阵（2026-08-15 实测）

| # | 用例 | 步骤 | 预期 | 实测 |
|---|---|---|---|---|
| 1 | 贴图准入 | 经 API 发送含图片块的消息 | 接受并入库 | ✅ `accepted:true` |
| 2 | 聊天保留整张图 | 贴图后检查会话日志 | 图片块与文本共存（缩略图保留） | ✅ `image,text` |
| 3 | 序列化层转换 | 行为测试：图片块/嵌套 tool-result/纯文本 | wire 只有路径文本，无 image 块 | ✅ 3 场景 PASS |
| 4 | 无扩展名附件读图 | view_image 读裸哈希路径 | magic-byte 嗅探识别；非图片拒绝 | ✅ data:image/png；`/etc/hosts` 被拒 |
| 5 | 任意视觉问答 | view_image 普通档 | 中文回答正确 | ✅ 主色调判断正确 |
| 6 | 高精度路由 | 问题含「高精度」 | 自动用 qwen-vl-plus | ✅ 回答细节显著更丰富 |
| 7 | 并发读图 | 同图双问并行 | 无互斥、均成功 | ✅ isConcurrencySafe 实测 |
| 8 | 同图同问缓存 | 重复相同调用 | LRU 命中、答案一致 | ✅ |
| 9 | 大图自动压缩 | >2MB 图上传 | 长边压至 1600px | ✅ 3.3MB → 1.4MB |
| 10 | 本地 OCR | 中文截图 ×3 | 全文提取稳定 | ✅ 0.47s ×3 一致 |
| 11 | 故障转移 | modlens 默认链（gemini→openai） | gemini 不可用时自动切 openai | ✅ 双向实测 |
| 12 | 兜底脚本 | vision.py 自动选 provider | 正常回答 | ✅ |
| 13 | 回归 | 序列化补丁/准入声明/开关配置在位 | 全在位 | ✅ |
| 14 | 重启恢复 | 守护重启后 boot 日志 | 无错误、工具可挂载 | ✅ |

## 三、实测基准（同一样图 1740×928，单样本）

| 引擎 | 耗时 | 说明 |
|---|---|---|
| dsh-ocr | ~0.5s | 本地、免费、不限量 |
| view_image（qwen3-vl-flash） | 4–9s | 免费档，波动来自排队与输入 token |
| view_image（qwen-vl-plus） | 更慢更准 | 高精度关键词或失败回退触发，按量计费 |
| modlens 引擎（gemini-flash-latest） | ~9s | 结构化证据管线，多轮调用 |
| 大图压缩收益 | −58% 上传体积 | 3.3MB → 1.4MB，输入 token 是 VLM 耗时主因 |

## 四、稳定性与安全结论

- **故障转移**：modlens 引擎链 `gemini-api → openai` 跨厂商自动切换（实测 gemini 临时不可用时无感切到通义）；view_image 端内回退 `qwen-vl-plus`（仅 429/404/5xx 触发）。
- **密钥面**：全部 0600（`.env`、`~/.modlens/config.json`）；patch 文件无内联密钥；错误路径 key 脱敏；仓库与日志扫描零泄露。
- **输入面**：扩展名白名单 + magic-byte 双重校验；体积上限；响应 2MB 硬上限；超时熔断。
- **已知限制**：VLM 输出本身不保证绝对正确（见 README「准度与速率优化」的交叉验证惯例）；子智能体会话不支持图片（宿主限制）；序列化补丁位于 npx 缓存，DSH 升级后需按 `docs/patch-image-blocks.md` 重打。
