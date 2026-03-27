import { env } from "../../env.js";
import type { LLMService } from "./interface.js";

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
        console.error(
          `[llm] DeepSeek API error: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error("[llm] DeepSeek returned empty content");
        return null;
      }

      return JSON.parse(content);
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        // JSON parse failure — distinct from timeout/network failure
        console.error("[llm] Failed to parse DeepSeek response as JSON");
        return null;
      }

      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      if (isAbort) {
        console.error("[llm] DeepSeek call timed out after 30s");
      } else {
        console.error("[llm] DeepSeek call failed:", error);
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
