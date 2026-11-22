import { HttpException } from "@nestjs/common";

export type PlanLimitCode =
  "FILE_TOO_LARGE" | "DOCUMENT_LIMIT" | "MESSAGE_LIMIT";

/** HTTP 402 with a machine-readable code, so the UI can show an upgrade prompt. */
export class PlanLimitError extends HttpException {
  constructor(
    readonly code: PlanLimitCode,
    message: string,
  ) {
    super({ statusCode: 402, error: "Payment Required", code, message }, 402);
  }
}
