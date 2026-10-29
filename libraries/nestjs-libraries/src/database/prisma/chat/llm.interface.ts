// chat/interfaces/llm.interface.ts

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateAnswerInput {
  messages: ChatMessage[];
}

export interface GenerateAnswerOutput {
  content: string;
}

export interface LLMService {
  generateAnswer(input: GenerateAnswerInput): Promise<GenerateAnswerOutput>;
}
