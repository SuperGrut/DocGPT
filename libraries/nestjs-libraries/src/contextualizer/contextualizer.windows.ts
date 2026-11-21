import type { TokenCounter } from "@docgpt/nestjs-libraries/chunker/chunker.interface";
import type {
  Block,
  LoadedDocument,
} from "@docgpt/nestjs-libraries/loader/loader.interface";

export interface DocumentWindows {
  /** Document text per window. Every chunk in a window shares one prompt prefix, so prompt caching works. */
  windows: string[];
  /** Block.order -> index into `windows`. */
  windowOf: Map<number, number>;
}

function blockText(block: Block): string {
  switch (block.type) {
    case "text":
      return block.text.trim();
    case "table":
      return block.markdown.trim();
    case "image":
      return block.caption?.trim() ?? "";
  }
}

/**
 * Splits the parsed document into consecutive windows of at most `budgetTokens`, each starting with
 * the title. A short document is a single window, which is exactly Anthropic's "whole document" setup.
 */
export function buildWindows(
  doc: LoadedDocument,
  budgetTokens: number,
  tokens: TokenCounter,
): DocumentWindows {
  const title = doc.metadata?.title?.trim();
  const header = title ? `Title: ${title}\n\n` : "";
  const headerCost = tokens.count(header);
  const room = Math.max(1, budgetTokens - headerCost);

  const windows: string[] = [];
  const windowOf = new Map<number, number>();
  let parts: string[] = [];
  let used = headerCost;

  const close = () => {
    if (parts.length) windows.push(header + parts.join("\n\n"));
    parts = [];
    used = headerCost;
  };

  for (const block of [...doc.blocks].sort((a, b) => a.order - b.order)) {
    let text = blockText(block);
    if (!text) continue;

    let cost = tokens.count(text);
    if (cost > room) {
      // A single block bigger than a whole window: clip it.
      text = text.slice(
        0,
        Math.max(1, Math.floor((text.length * room) / cost)),
      );
      cost = tokens.count(text);
    }

    if (parts.length && used + cost > budgetTokens) close();
    windowOf.set(block.order, windows.length); // index of the window being filled
    parts.push(text);
    used += cost;
  }
  close();

  return { windows, windowOf };
}
