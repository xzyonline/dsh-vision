# 序列化层图片补丁（imageBlocksToText）说明

适用对象：`<DSH_HOME>/.npm/_npx/*/node_modules/@deepseek-ai/dsh-llm-deepseek/lib/index.js`
（即 npx 缓存中的 dsh-llm-deepseek）。**DSH 升级会覆盖此文件，需重打。**

## 作用

DeepSeek chat-completions 是纯文本适配器。本补丁在**序列化层**（只改发给模型的 wire，
不动会话日志、不动 UI 缩略图）把消息与历史中的图片块转成「已保存为本地文件」路径文本：

- 模型拿到路径后自行调用 `view_image` / `dsh-ocr` 读取；
- 聊天界面里的整张图不受影响；
- 历史含图的老会话重放时同样转换，不会 `UNSUPPORTED_CONTENT`。

## 补丁内容（三部分）

### 1. 顶部导入

```js
import { homedir } from "node:os";
import { join } from "node:path";
```

### 2. 新增函数（放在 serializeMessages 之前）

```js
/** DSH vision patch: describe saved image attachments as local file paths instead of failing. */
function imageBlocksToText(blocks) {
	return blocks.map((block) => {
		if (block.type === "image" && block.attachment?.attachmentId !== void 0) {
			const id = String(block.attachment.attachmentId).replace(/^sha256:/, "");
			const home = process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
			const path = join(home, "attachments", "v1", "objects", id.slice(0, 2), id);
			const meta = [block.attachment.mediaType, block.attachment.name].filter(Boolean).join(", ");
			return {
				type: "text",
				text: `\n[用户粘贴的图片已保存为本地文件：${path}${meta ? `（${meta}）` : ""}。请用 view_image 工具或 dsh-ocr 命令读取该文件内容。]\n`
			};
		}
		if (block.type === "tool-result") return { ...block, content: imageBlocksToText(block.content) };
		return block;
	});
}
```

### 3. serializeMessages 改造

```js
function serializeMessages(messages) {
	const wire = [];
	for (const message of messages) {
		const content = imageBlocksToText(message.content);   // ← 原 assertTextOnly(message.content) 替换为这行
		if (message.role === "system") {
			wire.push({ role: "system", content: flattenText(content) });
			continue;
		}
		if (message.role === "assistant") {
			wire.push(serializeAssistant({ ...message, content }));
			continue;
		}
		const toolResults = content.filter((block) => block.type === "tool-result");
		const text = flattenText(content);
		// ……其余不变
	}
	return wire;
}
```

### 4. 准入声明（配套）

`inputModalities: ["text"]` → `["text", "image"]`（同文件 2 处）：DSH 以此判断
「当前模型是否支持图片」的贴图准入，纯文本声明会让原生贴图被拒。

## 验证

- `node --check` 语法通过；
- 行为测试：构造含 image 块的消息 → `serializeMessages` 输出应只有路径文本、无 image 块；
  含 tool-result 嵌套图片的消息同样递归转换；
- 重启 web 后贴图：聊天里显示整张图，模型回答正常。

## 关联

- 关闭开关：`~/.dsh/profiles/web/cordis.patch.yml` 的 modlens 行应为
  `autoRead: false` + `pasteToPath: false`（autoRead 的 pre-step 改写会吞掉聊天里的图，
  paste-to-path 会把贴图换成路径文字）。
- 历史踩坑与修复记录见 [REVIEW.md](./REVIEW.md)（BUG-1 / BUG-5 / BUG-6）。
