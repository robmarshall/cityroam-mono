/**
 * Abstract LLM service interface.
 * All LLM calls return a parsed JSON object or null on failure/timeout.
 */
export interface LLMService {
  classify(prompt: string): Promise<object | null>;
}
