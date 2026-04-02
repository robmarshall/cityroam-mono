export interface IntentClassification {
  type:
    | "answer-attempt"
    | "hint-request"
    | "hint-nudge"
    | "contextual-comment"
    | "question"
    | "off-topic-chat"
    | "prompt-injection"
    | "inappropriate"
    | "clarification";
}

export interface AnswerMatchResult {
  type: "answer-correct" | "answer-incorrect";
}

export interface QuestionAnswerResult {
  type: "answer" | "unknown";
  text?: string;
}

export interface GuideState {
  current_stop: number;
  wrong_attempts: number;
  hints_given: number;
  total_hints: number;
  intent: IntentClassification;
}
