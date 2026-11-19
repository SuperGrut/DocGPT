import type { ChatMessageStatus } from "@prisma/client";

export interface ChatSource {
  n: number; // matches the [n] markers in the answer
  chunkId: string;
  documentId: string;
  fileName: string;
  pageStart: number | null;
  pageEnd: number | null;
}

export type ChatEvent =
  | {
      type: "start";
      data: { userMessageId?: string; replacesMessageId?: string };
    }
  | { type: "sources"; data: { sources: ChatSource[] } }
  | { type: "token"; data: { text: string } }
  | { type: "title"; data: { title: string } }
  | {
      type: "done";
      data: { messageId: string | null; status: ChatMessageStatus };
    }
  | { type: "error"; data: { message: string; messageId: string | null } };
