import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "schemastery";
import { readFile, stat, open } from "node:fs/promises";
import { extname } from "node:path";
//#region src/vlm.ts
/**
* Minimal OpenAI-compatible vision chat client over global fetch. One request
* shape covers every backend (DashScope, Zhipu, Volcengine, Moonshot, Ollama,
* OpenAI…): POST {baseURL}/chat/completions with an image_url content part.
* @module dsh-vision/vlm
*/
const MIME_BY_EXT = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
	".gif": "image/gif",
	".bmp": "image/bmp",
	".tif": "image/tiff",
	".tiff": "image/tiff",
	".heic": "image/heic"
};
/** Magic-byte sniffers for extensionless paths (DSH attachment store files have bare hash names). */
const SNIFF_MIME = [
	{ mime: "image/png", test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
	{ mime: "image/jpeg", test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
	{ mime: "image/gif", test: (b) => b.length >= 6 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a") },
	{ mime: "image/webp", test: (b) => b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
	{ mime: "image/bmp", test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d }
];
async function sniffMime(path) {
	const handle = await open(path, "r");
	try {
		const head = Buffer.alloc(12);
		const { bytesRead } = await handle.read(head, 0, 12, 0);
		return SNIFF_MIME.find((s) => s.test(head.subarray(0, bytesRead)))?.mime;
	} catch {
		return void 0;
	} finally {
		await handle.close().catch(() => void 0);
	}
}
/** Resolve `source` to a URL the endpoint accepts: pass URLs through, base64 local files. */
async function toImageUrl(source, maxImageBytes) {
	if (/^(https?|data):/.test(source)) return source;
	const info = await stat(source).catch(() => {
		throw new Error(`view_image: file not found: ${source}`);
	});
	const mime = MIME_BY_EXT[extname(source).toLowerCase()] ?? await sniffMime(source);
	if (mime === void 0) {
		const supported = Object.keys(MIME_BY_EXT).join(" ");
		throw new Error(`view_image: unsupported image extension in ${JSON.stringify(source)} (supported: ${supported}, or pass an http(s)/data: URL)`);
	}
	if (info.size > maxImageBytes) throw new Error(`view_image: image is ${info.size} bytes, over the ${maxImageBytes}-byte limit (raise maxImageBytes in the dsh-vision config)`);
	return `data:${mime};base64,${(await readFile(source)).toString("base64")}`;
}
/** Pull assistant text out of an OpenAI-compatible response; content may be a string or parts. */
function extractText(payload) {
	if (typeof payload !== "object" || payload === null) return void 0;
	const choices = payload.choices;
	if (!Array.isArray(choices) || choices.length === 0) return void 0;
	const content = choices[0].message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		const parts = content.map((part) => typeof part === "object" && part !== null && typeof part.text === "string" ? part.text : "").filter((text) => text !== "");
		if (parts.length > 0) return parts.join("\n");
	}
}
const MAX_RESPONSE_BYTES = 2097152;
/** Read a response body with a hard cap, so a broken endpoint cannot balloon memory. */
async function readBoundedText(response, cap = MAX_RESPONSE_BYTES) {
	const declared = response.headers.get("content-length");
	if (declared !== null && Number(declared) > cap) throw new Error(`view_image: response body is ${declared} bytes, over the ${cap}-byte limit`);
	if (response.body === null) return await response.text();
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > cap) {
			await reader.cancel().catch(() => void 0);
			throw new Error(`view_image: response body over the ${cap}-byte limit`);
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}
/** Ask the VLM one question about one image; returns the answer text or throws with a redacted message. */
async function visionChat(request) {
	const doFetch = request.fetch ?? fetch;
	const url = `${request.baseURL.replace(/\/$/, "")}/chat/completions`;
	const imageUrl = await toImageUrl(request.source, request.maxImageBytes);
	const signals = [AbortSignal.timeout(request.timeoutMs), ...request.signal === void 0 ? [] : [request.signal]];
	const redact = (text) => request.apiKey === "" ? text : text.replaceAll(request.apiKey, "***");
	let response;
	try {
		response = await doFetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...request.apiKey === "" ? {} : { authorization: `Bearer ${request.apiKey}` }
			},
			body: JSON.stringify({
				model: request.model,
				max_tokens: request.maxTokens,
				messages: [{
					role: "user",
					content: [{
						type: "image_url",
						image_url: { url: imageUrl }
					}, {
						type: "text",
						text: request.question
					}]
				}]
			}),
			signal: AbortSignal.any(signals)
		});
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(redact(`view_image: request to ${url} failed: ${reason}`));
	}
	const body = await readBoundedText(response);
	if (!response.ok) throw new Error(redact(`view_image: ${url} returned ${response.status}: ${body.slice(0, 500)}`));
	let payload;
	try {
		payload = JSON.parse(body);
	} catch {
		throw new Error(redact(`view_image: ${url} returned non-JSON body: ${body.slice(0, 200)}`));
	}
	const text = extractText(payload);
	if (text === void 0) throw new Error(redact(`view_image: no assistant text in response: ${body.slice(0, 300)}`));
	const cleaned = stripThink(text);
	if (cleaned === "") throw new Error("view_image: model returned only reasoning and no answer (try raising maxTokens)");
	return cleaned;
}
/**
* Thinking-mode VLMs (e.g. glm-4.1v-thinking-flash) inline their reasoning as
* <think>…</think> in the content. Strip it; a response that is ONLY an
* unterminated think block (reasoning ate the token budget) becomes empty.
*/
function stripThink(text) {
	const closed = text.replace(/<think>[\s\S]*?<\/think>/g, "");
	if (closed !== text) return closed.trim();
	if (/^\s*<think>/.test(text)) return "";
	return text.trim();
}
//#endregion
//#region src/index.ts
const name = "dsh-vision";
const inject = ["tools", "systemPrompt"];
const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
/** Zhipu's free tier gets congested (HTTP 429 code 1305); older free models still answer. */
const DEFAULT_FREE_FALLBACKS = ["glm-4.1v-thinking-flash", "glm-4v-flash"];
/** Errors worth trying the next model for: rate limit, missing model, server trouble. */
const RETRIABLE = /returned (?:429|404|5\d\d)/;
const Config = z.object({
	baseURL: z.string().default(DEFAULT_BASE_URL).description("OpenAI-compatible endpoint base URL (…/chat/completions is appended)"),
	apiKey: z.string().role("secret").default("").description("API key; falls back to $VISION_API_KEY (or exported $DSH_VISION_API_KEY), then $ZHIPUAI_API_KEY / $DASHSCOPE_API_KEY"),
	model: z.string().default("glm-4.6v-flash").description("Vision model id at the endpoint, e.g. glm-4.6v-flash (free) / glm-4.6v / qwen3-vl-flash / qwen3.7-plus / qwen3-vl:4b"),
	fallbackModels: z.array(z.string()).default([]).description("Models tried in order when the primary returns 429/404/5xx; defaults to Zhipu free-tier chain when baseURL is the default"),
	maxTokens: z.number().step(1).min(1).max(32768).default(2048),
	timeoutMs: z.number().step(1).min(1e3).max(3e5).default(6e4),
	maxImageBytes: z.number().step(1).min(1).default(10485760)
});
const PROMPT_TEXT = `## Vision (view_image)
The chat model itself cannot see images, but the view_image tool can. Whenever an image matters — a screenshot path the user mentions, an image URL, a chart, a UI mockup — call view_image instead of guessing or refusing. Ask it a specific question (extract text, count objects, read a chart, describe the layout); it answers arbitrary questions, not just captions. Prefer one focused call per thing you need to know; ask a follow-up call rather than one vague question.`;
const TEXT_OUTPUT = {
	schema: { type: "string" },
	render: (_args, value) => [{
		type: "text",
		text: String(value)
	}]
};
function apply(ctx, config) {
	const resolved = {
		baseURL: config.baseURL ?? DEFAULT_BASE_URL,
		model: config.model ?? "glm-4.6v-flash",
		maxTokens: config.maxTokens ?? 2048,
		timeoutMs: config.timeoutMs ?? 6e4,
		maxImageBytes: config.maxImageBytes ?? 10485760
	};
	const fallbackModels = config.fallbackModels !== void 0 && config.fallbackModels.length > 0 ? config.fallbackModels : resolved.baseURL === DEFAULT_BASE_URL && resolved.model === "glm-4.6v-flash" ? DEFAULT_FREE_FALLBACKS : [];
	const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(resolved.baseURL);
	const resolveApiKey = () => {
		const key = config.apiKey !== void 0 && config.apiKey !== "" ? config.apiKey : process.env.VISION_API_KEY ?? process.env.DSH_VISION_API_KEY ?? process.env.ZHIPUAI_API_KEY ?? process.env.DASHSCOPE_API_KEY ?? "";
		if (key === "" && !isLocal) throw new Error("view_image: no API key. Set the dsh-vision apiKey config, or set VISION_API_KEY (in ~/.dsh/.env or exported; also honored: ZHIPUAI_API_KEY, DASHSCOPE_API_KEY — DSH_* names are rejected inside .env files, so the old DSH_VISION_API_KEY works only when exported). The default model glm-4.6v-flash is FREE — create a key in 1 minute at https://open.bigmodel.cn. Offline alternative: baseURL http://localhost:11434/v1 + an Ollama vision model, no key needed.");
		return key;
	};
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "view_image",
		description: "Look at an image and answer a question about it (OCR, counting, chart reading, layout, arbitrary visual questions). Accepts an absolute local file path, an http(s) URL, or a data: URL.",
		parameters: {
			source: {
				type: "string",
				required: true,
				description: "The image: absolute local file path, http(s) URL, or data: URL"
			},
			question: {
				type: "string",
				description: "What to find out about the image. Be specific. Default: a thorough general description including any visible text."
			}
		},
		output: TEXT_OUTPUT,
		timeoutMs: resolved.timeoutMs,
		isConcurrencySafe: () => true,
		execute: async (args, exec) => {
			const input = args;
			const source = typeof input.source === "string" ? input.source : "";
			if (source === "") throw new Error("view_image: source is required");
			const question = typeof input.question === "string" && input.question !== "" ? input.question : "Describe this image thoroughly. Include any visible text verbatim, the overall layout, and notable details.";
			const apiKey = resolveApiKey();
			let lastError;
			for (const model of [resolved.model, ...fallbackModels]) try {
				return await visionChat({
					...resolved,
					model,
					apiKey,
					source,
					question,
					signal: exec.signal
				});
			} catch (error) {
				lastError = error;
				if (!(error instanceof Error) || !RETRIABLE.test(error.message)) throw error;
			}
			throw lastError;
		}
	})), "dsh-vision.tool");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "tool:dsh-vision",
		order: 116,
		text: PROMPT_TEXT
	}), "dsh-vision.prompt");
}
//#endregion
export { Config, apply, inject, name };
