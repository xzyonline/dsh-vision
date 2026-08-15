# 第三方组件归因声明（THIRD-PARTY NOTICES）

本文件覆盖 `dsh-vision`（DSH 视觉方案）项目。所有直接依赖均为 OSI 批准的许可证（MIT / BSD-3-Clause），与本项目许可证兼容。

## 方案级组件

| 组件 | 许可证 | 用途 | 上游项目 |
|---|---|---|---|
| ModLens（@liustack/modlens 3.16.6） | MIT | 粘贴→文件路径链路、autoRead 请求前图片转换、`(modlens vision)` 包装路由、`modlens_read_image` 结构化识图 | [liustack/modlens](https://github.com/liustack/modlens)（作者 Leon Liu） |
| macOS Vision framework | Apple 系统框架 | `dsh-ocr` 本地 OCR 引擎 | [Apple Developer](https://developer.apple.com/documentation/vision) |
| 通义千问 qwen3-vl-flash | 云端服务 | 本机默认 VLM（DashScope compatible-mode） | [阿里云百炼](https://www.alibabacloud.com/help/en/model-studio/vision) |
| 智谱 GLM-4.6V-Flash | 云端服务 | 插件默认免费档 | [open.bigmodel.cn](https://open.bigmodel.cn) |
| Gemini API（gemini-flash-latest） | 云端服务 | modlens 引擎第二免费线（故障转移） | [ai.google.dev](https://ai.google.dev) |

## dsh-vision 插件自身依赖

| 依赖 | 许可证 | 用途 | 上游项目 |
|---|---|---|---|
| schemastery | MIT | 配置/参数 schema | @deepseek-ai/schemastery（源自 [koishi/schemastery](https://github.com/koishijs/schemastery)） |
| （无其他运行时依赖） | — | 调用任意 OpenAI 兼容 VLM 端点（原生 fetch），无 SDK | — |

框架 peer 依赖（运行宿主提供）：@deepseek-ai/cordis、@deepseek-ai/dsh-tools、@deepseek-ai/dsh-system-prompt（DeepSeek Harness，MIT）。

## 范式借鉴（非代码依赖）

- **「给文本模型文件路径而非图片」的粘贴范式**：借鉴 [Pi](https://pi.ai)、[OpenCode](https://opencode.ai)、[Claude Code](https://claude.com/code) 的贴图处理思路，经 ModLens 的 paste-to-path / recover-paste 实现（其源码注释与 README 明确标注了这一借鉴）。

说明：识图能力转发到用户自备的 VLM 服务；本项目不内置、不捆绑任何模型权重或第三方服务密钥。

---

*以上版权与许可归各上游项目及其作者所有。更新日期：2026-08-15。*
