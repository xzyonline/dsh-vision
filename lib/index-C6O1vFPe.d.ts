import ToolRuntime from "@deepseek-ai/dsh-tools";
import z from "schemastery";
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";

//#region src/index.d.ts

type Context$1 = Context & {
  tools: ToolRuntime;
  systemPrompt: SystemPrompt;
};
declare const name = "dsh-vision";
declare const inject: string[];
interface Config {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  fallbackModels?: string[];
  maxTokens?: number;
  timeoutMs?: number;
  maxImageBytes?: number;
}
declare const Config: z<Config>;
declare function apply(ctx: Context$1, config: Config): void;
//#endregion
export { Config, apply, inject, name };