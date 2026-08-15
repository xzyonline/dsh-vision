# dsh-vision

Eyes for a text-only DeepSeek. Registers a `view_image` tool that forwards the model's question about an image to any OpenAI-compatible vision endpoint and returns the answer as text. The default model (Zhipu `glm-4.6v-flash`) is free; DashScope, Volcengine, Moonshot, local Ollama, and future DeepSeek vision APIs work with the same configuration surface.

[![CI](https://github.com/xzyonline/dsh-vision/actions/workflows/ci.yml/badge.svg)](https://github.com/xzyonline/dsh-vision/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-BSD--3--Clause-blue.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/xzyonline/dsh-vision)](https://github.com/xzyonline/dsh-vision/releases)

## Features

- **`view_image` tool** — accepts an absolute local path, an http(s) URL, or a data: URL; answers arbitrary questions (OCR, counting, chart reading, layout).
- **Model guidance** — a system-prompt section teaches the model to call the tool whenever an image matters, with one focused question per call.
- **Backend fallback** — on 429/404/5xx, retries the next model in `fallbackModels` (defaults to the free-tier chain on the default endpoint).
- **Thinking-model support** — strips inline `<think>…</think>` reasoning; reasoning-only answers fail with actionable guidance.
- **Safe by default** — API key is never logged (redacted from error messages), requests carry a hard timeout, responses are capped at 2 MB, and local files are size-limited before base64 upload.

## Install

### Download the prebuilt bundle (recommended)

1. Get `dsh-vision-0.1.0.zip` from [Releases](https://github.com/xzyonline/dsh-vision/releases) and verify it against `SHA256SUMS.txt`.
2. Extract anywhere and double-click the installer: `install.bat` (Windows) or `install.command` (macOS/Linux).
3. Restart the dsh web process and hard-refresh the browser.

Uninstall with `uninstall.bat` / `uninstall.command`.

### From source

Requires Node.js ≥ 20.

```sh
git clone https://github.com/xzyonline/dsh-vision.git
cd dsh-vision
npm install
node scripts/install.mjs
```

The installer builds `lib/`, links the package into the shared profile directory (`$DSH_HOME/profiles/node_modules`, so every profile resolves it), and appends one row to `$DSH_HOME/cordis.patch.yml` (backed up first). It is idempotent. See [docs/DEPLOY.md](./docs/DEPLOY.md) for per-platform details.

## Configuration

The plugin works without configuration once a key is present. Options are set in the `dsh-vision` row of the patch file (or plugin config):

| Option | Default | Notes |
|---|---|---|
| `apiKey` | `''` | Falls back to `VISION_API_KEY` (`~/.dsh/.env` or exported), then `ZHIPUAI_API_KEY`, then `DASHSCOPE_API_KEY`. Unset for local endpoints. |
| `baseURL` | `https://open.bigmodel.cn/api/paas/v4` | Any OpenAI-compatible base; `/chat/completions` is appended. Ollama: `http://localhost:11434/v1`. |
| `model` | `glm-4.6v-flash` | e.g. `glm-4.6v`, `qwen3-vl-flash`, `qwen3-vl:4b`. |
| `fallbackModels` | free-tier chain on default endpoint | Retried in order on 429/404/5xx. |
| `maxTokens` / `timeoutMs` / `maxImageBytes` | `2048` / `60 000` / `10 MB` | Bounds for the VLM call. |

Zero-cost default: create a Zhipu key in about a minute at <https://open.bigmodel.cn> and set `VISION_API_KEY`. Local alternative: set `baseURL` to your Ollama instance and pick a vision model — no key required.

## Safety model

- The API key is resolved per call and redacted from every error path.
- HTTP and data: URLs are passed through; local files are extension-whitelisted, size-capped, and uploaded as base64.
- The tool runs in-process with a hard timeout; response bodies are stream-capped at 2 MB.

## Compatibility

Host-only plugin (no browser bundle): macOS, Windows, and Linux are equivalent. CI runs on ubuntu / macos / windows × Node 22 / 24, including an installer smoke test.

## Development

```sh
npm install
npm run build       # lib/
npm run typecheck
npm test            # 19 tests (unit + real Cordis composition)
```

## Attribution and license

- BSD-3-Clause. See [LICENSE](./LICENSE).
- Dependency attributions: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
- No model weights or third-party service keys are bundled; image understanding is delegated to the endpoint you configure.
