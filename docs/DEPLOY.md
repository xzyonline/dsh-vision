# 部署指南（macOS / Windows / Linux）

## ⭐ 方式一:下载预构建包(推荐,无需 git/构建)

1. 从 [Releases](https://github.com/xzyonline/dsh-vision/releases) 下载 `dsh-vision-0.1.0.zip`,用 `SHA256SUMS.txt` 校验:
   ```sh
   shasum -a 256 dsh-vision-0.1.0.zip                     # macOS/Linux
   certutil -hashfile dsh-vision-0.1.0.zip SHA256         # Windows PowerShell
   ```
2. 解压到任意目录;
3. 双击安装:**Windows 双击 `install.bat`;macOS/Linux 双击 `install.command`**;
4. 设置 API key(见下);
5. 重启 dsh web → 浏览器硬刷新(macOS `Cmd+Shift+R` / Windows `Ctrl+Shift+R`);
6. 验证:让模型「看看这张图」并给出图片路径,模型会调用 `view_image`。

卸载双击 `uninstall.bat` / `uninstall.command`。

## API key(二选一)

- **免费云端(默认)**:到 https://open.bigmodel.cn 创建智谱 key(约 1 分钟),然后:
  ```sh
  export VISION_API_KEY=你的key        # 或写入 ~/.dsh/.env 的 VISION_API_KEY=你的key
  ```
- **本地免 key**:在 `~/.dsh/cordis.patch.yml` 的 `dsh-vision` 行下加 config:
  ```yaml
  - insert:
      - id: dsh-vision
        name: '@dsh-external/dsh-vision'
        config:
          baseURL: http://localhost:11434/v1
          model: qwen3-vl:4b
  ```

## 方式二:源码部署

前置:Node.js ≥ 20。

```sh
git clone https://github.com/xzyonline/dsh-vision.git
cd dsh-vision
npm install
node scripts/install.mjs    # 自动构建 → 链接共享目录 → 写补丁(幂等)
```

`install.mjs` 内部:

1. `lib/index.js` 缺失时用 tsdown 自动构建;
2. 把包链接进 `<DSH_HOME>/profiles/node_modules/@dsh-external/dsh-vision`(共享扁平目录,所有 profile 可解析;Windows 无符号链接权限时回退目录联接);
3. 在 `<DSH_HOME>/cordis.patch.yml` 追加一行(已存在则跳过,写入前备份 `.bak`)。

> 迁移提示:若你此前以「绝对路径」方式挂载过 dsh-vision(`name: /path/to/lib/index.js`),请先手动删除那一行再运行本安装器,否则会因同 id 重复而跳过。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 模型说没有 API key | 设置 `VISION_API_KEY`(见上);注意 `.env` 文件里不支持 `DSH_` 前缀变量名,需用 `VISION_API_KEY` |
| 本地 Ollama 免 key 失败 | 确认 baseURL 以 `http://localhost` / `127.0.0.1` 开头(本地端点才跳过 key 校验) |
| 默认模型限流 | 插件自动回退免费链;或把 `model` 换成 `glm-4.6v` 等付费模型 |
| Windows 符号链接报权限错 | 安装器自动回退目录联接;若手动报错,用管理员 PowerShell 重试 |
| 想卸载 | `node scripts/install.mjs --uninstall`(只移除插件行与链接) |

## 升级

```sh
cd dsh-vision
git pull
npm install
node scripts/install.mjs    # 幂等
# 重启 web + 硬刷新
```
