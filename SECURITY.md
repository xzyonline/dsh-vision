# 安全策略（Security Policy）

## 报告漏洞

请勿在公开 issue 中披露细节。请通过 GitHub Security Advisory（仓库 Security 页 → Report a vulnerability）报告；我们会尽力在 7 天内确认、30 天内修复。

## 支持范围

- `view_image` 对不可信输入的健壮性（本地文件扩展名白名单与大小上限、响应体 2 MB 硬上限、请求超时）
- API key 处理（错误消息与日志全程脱敏，配置经 `role('secret')` 遮蔽）
- 依赖供应链（保持 `npm audit` 0 已知漏洞）

## 已知限制

- 图片理解能力取决于你配置的 VLM 端点；本插件不校验端点回传内容的真实性。
- `source` 允许 http(s) URL：模型可能被提示注入诱导读取任意可达地址（本地单用户工具的风险面，与模型安全设置共同承担）。
- 超时与体积上限为工程防护，不保证抵抗无限资源攻击。
