import { env } from "../../env.js";
import { createLogger } from "../../lib/logger.js";
import type { LLMService } from "./interface.js";

const log = createLogger("llm");

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const TIMEOUT_MS = 30_000;

export class DeepSeekService implements LLMService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? env.DEEPSEEK_API_KEY;
  }

  async classify(prompt: string): Promise<object | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const start = Date.now();

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        log.error("API error", { status: response.status, statusText: response.statusText, duration_ms: Date.now() - start });
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        log.error("empty content", { duration_ms: Date.now() - start });
        return null;
      }

      const result = JSON.parse(content);
      log.info("call complete", { duration_ms: Date.now() - start });
      return result;
    } catch (error: unknown) {
      const duration_ms = Date.now() - start;
      if (error instanceof SyntaxError) {
        log.error("JSON parse failure", { duration_ms });
        return null;
      }

      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      if (isAbort) {
        log.error("timeout", { duration_ms, timeout_ms: TIMEOUT_MS });
      } else {
        log.error("call failed", { duration_ms, error: error instanceof Error ? error.message : String(error) });
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
