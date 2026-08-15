# 部署指南（双端：Web / CLI）

方案组件分两种挂载层级：**宿主级**（`~/.dsh/cordis.patch.yml`，所有 profile 可用）与 **profile 级**（`~/.dsh/profiles/<name>/`，只在该 profile 可用）。按你要用的端选择部署面。

## 一、Web 端（dsh web，浏览器 GUI）

### 1. 装 dsh-vision 插件（宿主级，view_image 工具）

预构建包或源码安装（见 README [Install](#install)）。安装器会把插件链接进
`<DSH_HOME>/profiles/node_modules/@dsh-external/dsh-vision` 并写入宿主 patch。实测配置（DashScope 通义）：

```yaml
# ~/.dsh/cordis.patch.yml
- insert:
    - id: dsh-vision
      name: '@dsh-external/dsh-vision'
      config:
        baseURL: https://dashscope.aliyuncs.com/compatible-mode/v1
        apiKey: ""            # 建议留空，走 ~/.dsh/.env 的 VISION_API_KEY
        model: qwen3-vl-flash
        maxTokens: 2048
        timeoutMs: 60000
```

> 密钥三选一位置（均为 0600）：`~/.dsh/.env`（推荐）、宿主 patch 的 `apiKey`、环境变量。

### 2. 装 ModLens（web profile，autoRead 转换层）

```sh
~/.local/bin/dsh plugin add @liustack/modlens@3.16.6
mkdir -p ~/.modlens && chmod 700 ~/.modlens
# ~/.modlens/config.json（0600）：openai provider 指向任意 OpenAI 兼容 VLM
```

**必须开启 autoRead 并关闭 paste-to-path**（autoRead 保证图片块转成证据文本不再崩会话；paste-to-path 会把贴图换成路径文字、吞掉图片预览，关闭后贴图按原生入库显示整张图）：

```yaml
# ~/.dsh/profiles/web/cordis.patch.yml（追加）
- id: modlens
  config:
    autoRead: true
    pasteToPath: false
```

**放行原生贴图准入**（DSH 会把「当前模型是否声明 image 输入」作为图片消息准入条件；DeepSeek 适配器默认声明纯文本，贴图会被拒。把 `inputModalities` 两处 `["text"]` 改为 `["text","image"]` 即可——升级 DSH 后需重改）：

```sh
F=~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh-llm-deepseek/lib/index.js
sed -i '' 's/inputModalities: \["text"\]/inputModalities: ["text", "image"]/g' "$F"   # 应恰好替换 2 处
```

### 3. 重启与验证

```sh
# 重启 web（守护会在 10 秒内拉起；agent 跑在 web 进程内，勿在前台自杀式 kill）
lsof -ti :3080 -sTCP:LISTEN | xargs kill   # 在 CLI 会话里执行
# 浏览器硬刷新 Cmd+Shift+R
```

验证清单：
1. 默认模型贴一张图 → 输入框应**显示整张图缩略图**（不再是路径文字），发送后回答正常；
2. 打开一个历史含图的旧会话 → 不再报 `UNSUPPORTED_CONTENT`；
3. 贴图若提示「当前模型不支持图片」→ 是 `inputModalities` 声明丢失（第 2 步的 sed 未生效或 DSH 升级覆盖），重改后重启；
4. 让模型「看看这张图」→ 出现 `view_image` / `modlens_read_image` 调用。

## 二、CLI / headless 端（dsh --profile headless/tui）

无浏览器，无粘贴链路；其余能力全部可用：

| 能力 | 用法 |
|---|---|
| 任意视觉问答 | `view_image` 工具（宿主级挂载，所有 profile 可用） |
| 结构化识图 | `modlens_read_image` 工具（modlens 插件 host 半部） |
| 离线 OCR | `/Users/xiaoyu/.local/bin/dsh-ocr <文件>`（**绝对路径**：模型 shell 的 PATH 不含 `~/.local/bin`） |
| 多 provider 兜底 | `~/.dsh/skills/vision/.venv/bin/python ~/.dsh/skills/vision/vision.py <图片> "<问题>"` |

## 三、双端差异

| | Web | CLI/headless |
|---|---|---|
| 输入框贴图 → 整张图缩略图 | ✅ 原生贴图（准入声明 + autoRead 转换） | ❌ 无浏览器 |
| autoRead 请求前转换 | ✅ | ✅（同一 host 半部） |
| 模型工具 | ✅ | ✅ |
| 截图看屏幕 | ✅（`screencapture`，需一次屏幕录制授权） | 视终端环境而定 |

## 四、卸载 / 升级

- dsh-vision：`uninstall.command` / `node scripts/install.mjs --uninstall`。
- ModLens：`~/.local/bin/dsh plugin remove @liustack/modlens`；同时删除 `~/.dsh/profiles/web/cordis.patch.yml` 里的 `modlens` 行与 `~/.modlens/`。
- 升级后重启 web + 硬刷新（改配置/插件均需重启才生效）。

## 常见问题

| 现象 | 处理 |
|---|---|
| 贴图提示「当前模型不支持图片」 | `inputModalities` 声明丢失（DSH 升级覆盖）；重跑第 2 步的 sed 并重启 |
| 贴图后整轮报 `UNSUPPORTED_CONTENT` | autoRead 未开或未重启；检查 `~/.dsh/profiles/web/cordis.patch.yml` 的 modlens 行并重启 |
| 历史含图旧会话崩溃 | autoRead 开启后自动恢复；如需彻底清掉旧图片可做日志手术（见 REVIEW.md） |
| `dsh-ocr: command not found` | 用绝对路径 `/Users/xiaoyu/.local/bin/dsh-ocr` |
| 429 限流 | 免费档偶发，稍后重试或换 `vision.py --provider zhipu` |
| 401 | key 失效，更新 `~/.dsh/.env` |
| 重启后 view_image 不出现 | 插件在重启时挂载；先 dsh-ocr + vision.py 顶着 |
