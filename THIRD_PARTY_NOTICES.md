# 第三方组件归因声明（THIRD-PARTY NOTICES）

本文件覆盖 `dsh-vision`（识图）项目。所有依赖均为 OSI 批准的许可证（MIT / BSD-3-Clause），与本项目许可证兼容。

| 依赖 | 许可证 | 用途 | 上游项目 |
|---|---|---|---|
| schemastery | MIT | 配置/参数 schema | @deepseek-ai/schemastery（源自 [koishi/schemastery](https://github.com/koishijs/schemastery)） |
| （无其他运行时依赖） | — | 调用任意 OpenAI 兼容 VLM 端点（原生 fetch），无 SDK | — |

框架 peer 依赖（运行宿主提供）：@deepseek-ai/cordis、@deepseek-ai/dsh-tools、@deepseek-ai/dsh-system-prompt（DeepSeek Harness，MIT）。

说明：识图能力转发到用户自备的 VLM 服务（智谱 GLM-4.6V / 通义 qwen3-vl / Ollama 本地模型等），本项目不内置、不捆绑任何模型权重或第三方服务密钥。

---

*以上版权与许可归各上游项目及其作者所有。生成日期：2026-08-15。*
