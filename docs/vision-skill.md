---
name: vision
description: "本机已装好的『给 DeepSeek 的眼睛』工具链。当用户发来/提到图片、截图、PDF、图表、UI 报错截图、设计稿，说『看下这张图 / 识别这个文档 / 这个截图里是什么 / 帮我读一下这个 PDF』等任何需要看图或识文档的请求时使用本 skill。能力：① 简单看图首选切 deepseek-v4-flash-vision-exp 模型（DSH 2.0.2+ 原生多模态，直接贴图即可，见「原生视觉模型」节）；② view_image 工具（dsh-vision 插件，接通义千问 qwen3-vl-flash，模型可自主调用）；③ modlens_read_image 工具（结构化证据：OCR+布局+语义）；④ 本地 OCR dsh-ocr（macOS Vision 框架，免费离线，文档/截图文字提取首选，--boxes 输出文字像素框）；⑤ dsh-parse（markitdown 封装，PDF/Word/PPT/Excel 保结构转 Markdown，本地免费）；⑥ vision.py 兜底脚本（任意 OpenAI 兼容 VLM）；⑦ 坐标类任务（找图标/色块/文字位置、裁剪验证）先走本地 dsh-locate / dsh-ocr --boxes / dsh-grid 网格标注，VLM 报的像素坐标不可信。"
---

# vision — 本机的视觉能力（眼睛）

纯文本的 DeepSeek 模型自己看不了图，本机已搭好多层「眼睛」。**DSH 2.0.2（2026-08-22）起适配器原生注册了多模态模型 `deepseek-v4-flash-vision-exp`**，简单看图有了官方路径；其余分层工具（OCR/解析/坐标定位/兜底 VLM）与模型无关，继续有效。

## 原生视觉模型（DSH 2.0.2+，2026-08-22 新增）

- **`deepseek-v4-flash-vision-exp`**：适配器内置 `inputModalities: ["text","image"]`，原生 base64 / Files API 序列化图片——**贴图直传 DeepSeek，不需要任何补丁或外接 VLM**。
- 适用：任意简单视觉问答（看图、读图表、UI 分析）。用户贴图 + 该模型 = 最短链路。
- 注意：**v4-flash / v4-pro 仍纯文本**——在 v4-pro 下贴图会被拒（提示「当前模型不支持图片」）；旧贴图补丁（imageBlocksToText + 准入声明）已被 2.0.2 更新覆盖清除。若坚持在 v4-pro 下贴图，按 DEPLOY.md 重打补丁；否则推荐**看图时手动切 vision-exp 模型**。
- vision-exp 报的像素坐标同样不可信，坐标类任务仍走「坐标纪律」的本地工具层。

## 用户直接「粘贴图片」的链路（2026-08-22 更新：原生视觉模型优先）

用户可以在对话框里**直接粘贴/拖入图片**（PNG/JPG/WebP/GIF）。链路：

1. **首选（2.0.2+）**：模型切到 `deepseek-v4-flash-vision-exp`，贴图直接被原生多模态链路放行并直传（聊天显示整图缩略图，模型原生看图）。无需任何补丁。
2. **v4-pro 等纯文本模型下的贴图（旧链路，补丁已被 2.0.2 更新清除）**：图片按 DSH 原生附件入库（`~/.dsh/attachments/v1/objects/<前2位>/<sha256>`），聊天里显示整张图缩略图。放行靠 DeepSeek 适配器的 `inputModalities: ["text","image"]` 声明（DSH 升级后需按 DEPLOY.md 重打）；贴图被拒提示「当前模型不支持图片」=该声明丢了。
3. **序列化层转换**（imageBlocksToText 补丁，dsh-llm-deepseek/lib/index.js）：只改发给模型的 wire，图片块 → 「用户粘贴的图片已保存为本地文件：<路径>」文本；**聊天里的整图不受影响**；模型按路径用 view_image / dsh-ocr 读取。历史重放同样转换，不会再 UNSUPPORTED_CONTENT。**⚠️ 2026-08-22 核实：2.0.2 更新已覆盖此补丁，当前未重打——v4-pro 下贴图会失败，直到按 DEPLOY.md 复打为止。**
4. **已关闭的组件**：autoRead（pre-step 改写会把聊天里的图替换成 OCR 文字，实测踩坑已关）、
   paste-to-path（把贴图换成路径文字、吞图片预览，已关）。两个开关都在
   `~/.dsh/profiles/web/cordis.patch.yml` 的 `modlens` 行（autoRead: false, pasteToPath: false）。
5. **模型变体**：`(modlens vision)` 变体仅对未声明图片输入的 provider（如 glm）注册；DeepSeek 已由原生 vision-exp 或准入声明+序列化补丁覆盖，默认路由下无此变体。

⚠️ 铁律：**绝不能在 `~/.dsh/profiles/node_modules/` 里把包换成真实目录**——DSH 每次启动的 heal 会要求所有包是符号链接，否则所有 `dsh web`（含 DSH.app）直接启动失败（2026-08-14 实测踩坑）。

⚠️ 历史含图的老会话若仍报 `UNSUPPORTED_CONTENT`：确认序列化补丁（imageBlocksToText）在位且 web 已重启；旧图附件丢失时模型会得到失效路径，属正常降级，不影响对话。

## 优先级与工具选择

| 需求 | 用哪个 | 命令/方式 |
|---|---|---|
| 任意视觉问题（看图、数数、读图表、UI 分析）——**简单场景** | **切 deepseek-v4-flash-vision-exp 原生看图**（2.0.2+ 首选） | 模型选择器切到 vision-exp，用户直接贴图即可；无需调用任何工具 |
| 任意视觉问题（当前模型为纯文本模型时） | **view_image 工具** | 直接调用 `view_image` 工具，参数 `source`（文件绝对路径/URL）+ `question`（具体问题） |
| 结构化识图（需要 OCR 全文+布局+语义证据时） | **modlens_read_image 工具** | 参数 `path`（本地绝对路径/URL）+ 可选 `prompt` |
| 提取文字（文档、PDF、截图里的文字） | **dsh-ocr**（本地免费，优先于 VLM，省额度） | `/Users/xiaoyu/.local/bin/dsh-ocr <文件路径>`（**必须绝对路径**：模型 shell 的 PATH 不含 ~/.local/bin） |
| 整图布局概览、多元素定位 | **locate_map 工具**（单调用地图） | 一次返回全部文字像素框 + 图标/色块包围盒 + 背景色，通常一次就够 |
| 文字的精确定位（像素框） | **locate_text 工具**（本地） | 直接调用工具（返回 `x y w h<TAB>文字`）；bash 兜底：`dsh-ocr --boxes <图>` |
| 找图标/图形/色块位置、裁剪验证 | **locate_image 工具**（本地像素定位，零 API） | 直接调用工具（mode=scan/color/match/crop）；bash 兜底：`dsh-locate scan <图>` |
| 必须让 VLM 判断「在哪个区域」 | **grid_image 工具 + view_image** | 先 grid_image 叠编号网格 → view_image 问「在哪个格子（如 B3）」→ 按映射表换算像素 |
| 文档转 Markdown（PDF/Word/PPT/Excel 保标题/列表/表格结构） | **dsh-parse**（本地免费） | `/Users/xiaoyu/.local/bin/dsh-parse <文件> [-o 输出.md]` |
| view_image 不可用/想换模型/自定义端点 | vision.py 兜底脚本 | `~/.dsh/skills/vision/.venv/bin/python ~/.dsh/skills/vision/vision.py <图片> "<问题>"` |
| 用户要看当前屏幕内容 | 先截图再 OCR/view_image | `screencapture -x /tmp/dsh-shot.png` 然后 `/Users/xiaoyu/.local/bin/dsh-ocr /tmp/dsh-shot.png`（需屏幕录制权限，见下） |

## view_image（dsh-vision 插件）

- ⚠️ **2026-08-22 状态**：插件包经符号链接挂载于 `~/.dsh/profiles/{web,desktop}/node_modules/@dsh-external/dsh-vision` → `~/dsh-plugins/dsh-vision`（源码单一来源，DSH 升级不覆盖）；宿主 patch 行也在位。但 2.0.2 下运行时是否正常注册待实测——若工具列表里没有 view_image，重启 web 后仍缺失则查 `~/dsh-plugins/dsh-vision/lib` 报错；不可用时走 vision-exp 模型或 vision.py 兜底。
- 模型自己判断何时调用；`source` 支持本地绝对路径、http(s) URL、data URL。
- 后端配置在 `~/.dsh/cordis.patch.yml`（`dsh-vision` 条目，权限 600）：baseURL 为 DashScope compatible-mode，模型 `qwen3-vl-flash`（快、免费档、OCR 好）；`~/.dsh/.env`（600）里存有 `VISION_API_KEY`/`DASHSCOPE_API_KEY`，供插件与 vision.py 兜底脚本自动加载。
- 调用失败看返回的错误文本：429 是限流稍后重试，401 是 key 失效。
- 换模型/加智谱：编辑 `~/.dsh/cordis.patch.yml` 的 `config`（baseURL/model），改完重启 web 生效。
- **坐标类问题不要直接问它**：qwen3-vl-flash 报的像素坐标不可信（见「坐标纪律」）。

## modlens_read_image（ModLens 插件）

- 与 view_image 互补：返回**结构化 JSON 证据**（`ocr.full_text` 逐字转录、布局阅读序、语义、不确定性清单），需要引用原文证据时优先。
- 引擎复用 `~/.modlens/config.json`（600）的 provider（本机= DashScope qwen3-vl-flash）；失败看错误文本，`npx @liustack/modlens doctor` 可体检。

## dsh-ocr（本地 OCR，免费离线）

```sh
/Users/xiaoyu/.local/bin/dsh-ocr /path/to/xxx.png /path/to/xxx.pdf
/Users/xiaoyu/.local/bin/dsh-ocr --boxes /path/to/xxx.png   # 每行输出: x y w h<TAB>文字
```

- 基于 macOS Vision 框架（中文+英文），支持 png/jpg/heic/tiff/gif 与 PDF（逐页输出）。
- 不需要任何 API key、不走网络、不限量——**文档和截图里的文字提取永远先走它**，不够再上 VLM。
- `--boxes` 输出的坐标是**图像文件像素**（原点左上角），与 sips/screencapture/浏览器截图同坐标系，可直接用于裁剪或点击（Retina 截图注意 2× 换算，见「坐标纪律」）。
- **已注册为原生工具 `locate_text`**（vision-locate 插件，挂在 `~/.dsh/cordis.patch.yml`，独立于 dsh-vision、升级识图插件不影响）——模型可直接调用工具，无需 bash；bash 命令为兜底路径。

## dsh-locate（本地像素定位，零 API）

```sh
/Users/xiaoyu/.local/bin/dsh-locate scan  <图> [--bg '#FFFFFF'] [--tol 40] [--min-area 20] [--json]
/Users/xiaoyu/.local/bin/dsh-locate color <图> --target '#FF0000' [--tol 40]
/Users/xiaoyu/.local/bin/dsh-locate match <整图> <模板小图.png>
/Users/xiaoyu/.local/bin/dsh-locate crop  <图> --rect x,y,w,h [--out 裁剪.png] [--json]
```

- 纯 PIL+numpy 图像算法（vision venv 内），本地毫秒级、免费、无 429/超时——**坐标类问题首选**。
- `scan`：自动判定背景（四角众数）后输出所有非背景区域的包围盒，按面积降序（找图标一锤定音）。
- `color`：找指定颜色的像素块（如调试时注入的红块/高亮）。
- `match`：FFT 归一化互相关模板匹配，把已知小图在整图里定位，score≈1 为完全一致。
- `crop`：裁剪 + 验证非空（ink_ratio<0.02 判空白）——**裁完先验证再送 VLM**，杜绝「裁了个空白」浪费一轮。
- **已注册为原生工具 `locate_image`**（vision-locate 插件）——模型可直接调用工具；bash 命令为兜底路径。

## dsh-grid（网格标注，让 VLM 报格子）

```sh
/Users/xiaoyu/.local/bin/dsh-grid <图> [--cols 6] [--rows 4] [--out 网格图.png] [--json]
```

- 给截图叠上红网格 + 格子编号（行 A–Z、列 1–N），输出标注图 + 每个格子对应的像素矩形映射。
- 必须用语义判断位置时：把标注图交给 view_image，问「目标元素出现在哪些格子？只回答格子编号，如 B3」——**VLM 读字母数字强、报像素弱**；拿到格子编号后按本地映射表换算像素，换算零误差。
- **已注册为原生工具 `grid_image`**（vision-locate 插件）——模型可直接调用工具；bash 命令为兜底路径。

## dsh-parse（本地文档→Markdown，免费离线）

```sh
/Users/xiaoyu/.local/bin/dsh-parse /path/to/xxx.pdf /path/to/xxx.docx [-o /path/to/out.md]
```

- 基于 Microsoft markitdown（装在 `~/.dsh/skills/vision/.venv`，独立 venv 不碰 DSH），把 PDF/Word/PPT/Excel/CSV/HTML 等转成**保结构的 Markdown**（标题/列表/表格），本地运行、不联网、零费用。
- 分工：**只提文字 → dsh-ocr（~0.5s 更快更准）；整篇文档/要保留标题表格结构 → dsh-parse（~0.4s）**。两者都不够（扫描件、手写、复杂版面）再上 view_image。
- 扫描件/图片型 PDF 没有文字层，dsh-parse 输出少属正常——先 dsh-ocr 逐页提文字，再 view_image 复核。
- dsh-parse 不 OCR 图片内容（图片文件只取元信息）；升级依赖：`~/.dsh/skills/vision/.venv/bin/pip install -U "markitdown[pdf,docx,xlsx,pptx]"`。

## vision.py 兜底

```sh
~/.dsh/skills/vision/.venv/bin/python ~/.dsh/skills/vision/vision.py --provider qwen <图片路径> "<问题>"
```

- 内置 provider：`zhipu` / `doubao` / `qwen` / `openai` / `anthropic` / `gemini`，省略 `--provider` 时按 `VISION_PROVIDER` → 第一个有 key 的内置 provider 自动选。
- key 来源：`~/.dsh/.env`（自动加载）或环境变量；`VISION_API_KEY` 可作为任意 provider 的通用兜底 key。
- 自定义端点：设 `{NAME}_API_KEY` / `{NAME}_BASE_URL` / `{NAME}_MODEL` 即可（Ollama 本地等）。

## 截图（可选，需一次授权）

`dsh-ocr`/`view_image` 处理**已有文件**不需要任何授权。若要「看当前屏幕」，agent 会用 `screencapture` 截图——macOS 会要求给宿主进程**屏幕录制权限**：系统设置 → 隐私与安全性 → 屏幕录制，勾选运行 DSH 的那个应用（Terminal / iTerm / 由 launchd 拉起的 node 进程按提示授权）。授权一次永久生效。

## 坐标纪律：VLM 报的像素坐标不可信（2026-08-16 实战教训）

**真实案例**：qwen3-vl-flash 把行内图标（真实位置 x 84–126，行 padding-left=28px）报成「x≈60 的绿色方块」，按它的坐标裁剪全是空白，连续多轮误判「渲染坏了」，最后用本地像素扫描一锤定音——实际一切正常。VLM 看到的是 ~28×28 patch 网格，让它报原始像素 = 拿 token 猜数学题。

**要坐标时按层来，能停在前一层就别往下走**（第 2–4 层均有原生工具，模型可直接调用，不必走 bash）：

1. **DOM/几何**（网页场景，精度天花板）：浏览器工具（browser_*）或本地测试页直接拿 `getBoundingClientRect`/元素截图，坐标天然精确，根本不用视觉。调试 DSH web UI 永远先走这层。
2. **locate_map / locate_image / locate_text 工具**（本地像素算法，一锤定音）：整图概览先 `locate_map`（一次拿全部文字框+图标框）；单点用 `locate_image`（`scan` 找非背景区域包围盒 / `color` 找指定色块 / `match` 模板定位 / `crop` 裁完验证非空）与 `locate_text`（文字像素框）。零 API、结果可复现、无报错、带缓存。
3. **locate_text 工具 / dsh-ocr --boxes**：文字行的精确像素框（macOS Vision 自带 boundingBox）。
4. **grid_image 工具 / dsh-grid + VLM**：必须语义判断位置时，先叠网格编号让 VLM 报「格子」（B3），格子→像素用本地映射换算。
5. **VLM 裸报坐标**：只当参考，**不可直接用于裁剪/点击**；真要试，先 `sips -Z 1600` 缩小，并要求「以缩放后图片的像素为单位」，拿到后按缩放比例回算。

**截图纪律**（「空白图」主因是坐标错，不是截图质量）：
- 一个会话里统一坐标系（文件像素 or CSS 像素；Retina 截图是 2×，换算必须一致）。
- 裁完先 `dsh-locate crop --rect … --out x.png` 验证非空，再送 VLM。
- 网页元素优先元素级截图（Playwright `element.screenshot()`），不做二次裁剪。
- 送 VLM 前大图（长边 >2000px 或 >2MB）先 `sips -Z 1600` 压缩。

**报错减少**：坐标类任务走第 1–4 层 = 本地，零 API 调用 → 429/超时/key 失效全部绕开，view_image 只在语义判断时用。若 view_image 报 429：本地工具顶上，稍后重试；超时：先 sips 压缩再试；401：key 失效（见 view_image 节）。

## 实测基准与惯例（2026-08-15 晚单样本基准；vision-exp 耗时待 2.0.2 实测补充）

| 引擎 | 耗时 | 适用 |
|---|---|---|
| dsh-locate / dsh-grid（本地） | <0.3s | 坐标定位、裁剪验证永远优先 |
| dsh-ocr（本地） | ~0.5s | 文字提取永远优先 |
| dsh-parse（本地） | ~0.4s | PDF/Office 保结构转 Markdown |
| deepseek-v4-flash-vision-exp（原生多模态） | 待实测 | 简单看图首选（贴图直传，零配置） |
| view_image / vision.py（qwen3-vl-flash） | ~4-9s 波动 | 任意视觉问答（view_image 可用时） |
| modlens_read_image（结构化管线，多轮调用） | ~24s | 仅需要可引用证据/交叉验证时 |

提速惯例：交给 VLM 前，大图（长边 >2000px 或 >2MB）先用
`sips -Z 1600 <图> --out /tmp/v.jpg` 压缩（输入 token 是 VLM 耗时主因）。
dsh-ocr / dsh-locate 无需压缩。

精度惯例：重要文字/数据先 dsh-ocr（本地准、免费），存疑再用 view_image 复核；
坐标类先 dsh-locate / dsh-ocr --boxes（本地像素级），VLM 报的坐标只当参考；
高精度语义需求临时换 qwen-vl-plus/max 或 vision.py --provider 对比；
modlens 的不确定性清单（uncertainty）是交叉验证依据。

## 已知注意

- 重启 web 后 `view_image` 才出现在工具列表里（插件在重启时挂载）；没重启的话先用 dsh-ocr + vision.py。
- **vision-locate 独立插件**（locate_map / locate_image / locate_text / grid_image 四工具 + 「坐标纪律」系统提示段）挂在 `~/.dsh/cordis.patch.yml`，源码 `~/dsh-plugins/vision-locate/`（git 仓库；staging 副本 `~/dsh/.dsh-ops-staging/vision-locate/`）；与 dsh-vision 完全隔离，**升级识图插件不会覆盖**。
  ⚠️ **改插件铁律（2026-08-16 事故教训）**：DSH value-schema DSL 的**输出级 schema 不支持 `required: [...]` 数组**（参数级才用 `required: true`），`additionalProperties` 只允许显式 `true/false`——写错会让 defineTool 在 apply 时抛 JsonSchemaError，**整个 web profile 引导失败、前端永远转圈**。改完**必须先跑 `node ~/dsh-plugins/vision-locate/test-vision-locate.mjs` 通过**（真实执行 apply 编译 schema + 端到端 smoke，覆盖 --json 路径）才能重启 web（`lsof -ti :3080 -sTCP:LISTEN | xargs kill`，守护 10 秒内拉起）+ 浏览器硬刷新 Cmd+Shift+R。紧急回滚：恢复 `~/.dsh/cordis.patch.yml.bak-20260816` 或给 vision-locate 行加 `disabled: true`。
- 免费档可能偶发 429；view_image 已配回退链（qwen-vl-plus，仅失败时计费）；文字提取直接走 dsh-ocr 最稳（本地免费不限量）。
- dsh-parse 的 venv 与 DSH 完全隔离（`~/.dsh/skills/vision/.venv`），装包/升级不影响 harness 升级，反之亦然。
- dsh-locate.py / dsh-grid.py 源码与 SKILL.md 在 `~/.dsh/skills/vision/`，源码同步副本在 `~/dsh/.dsh-ops-staging/vision/`；`~/.local/bin/dsh-locate`、`~/.local/bin/dsh-grid` 是薄 wrapper（exec venv python）。dsh-ocr 的 Swift 源码同目录 `dsh-ocr.swift`。
- 本 skill 与 GitHub 方案仓库（xzyonline/dsh-vision）同步维护，改动请两边一起更新。
